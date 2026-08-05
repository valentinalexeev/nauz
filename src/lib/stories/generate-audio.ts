import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateLongSpeech } from "@/lib/elevenlabs/long-speech";
import { embedWatermark } from "@/lib/watermark";
import { embedProvenanceTags } from "@/lib/provenance/id3-tags";
import { ALLOWED_SPEEDS } from "@/lib/stories/speed-options";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface GenerateStoryAudioParams {
  userId: string;
  voiceId: string;
  templateId: string;
  speed?: number;
}

export interface GenerateStoryAudioResult {
  storyId: string;
}

/**
 * Синтезирует аудио выбранным голосом для уже существующей записи (story) и
 * сохраняет его как новую строку audio_generations. Общая часть между
 * созданием первой озвучки новой сказки и добавлением ещё одного голоса к
 * уже существующей — см. generateStoryAudio() и addStoryVoice() ниже,
 * по аналогии с generateChapterAudio() для глав книг.
 */
async function synthesizeAndStoreGeneration(
  admin: SupabaseClient,
  {
    userId,
    storyId,
    voice,
    textMarked,
    languageCode,
    speed,
  }: {
    userId: string;
    storyId: string;
    voice: { id: string; elevenlabs_voice_id: string; kyc_verification_id: string | null };
    textMarked: string;
    languageCode: string;
    speed: number;
  },
): Promise<void> {
  // Для провенанса (см. src/lib/provenance/id3-tags.ts) — на случай утечки
  // записи нужно уметь выйти на человека, который загрузил образец и прошёл
  // KYC (не обязательно на владельца голоса — тот может быть уже покойным).
  let kycProvider: string | null = null;
  let kycSessionId: string | null = null;
  if (voice.kyc_verification_id) {
    const { data: verification } = await admin
      .from("kyc_verifications")
      .select("provider, external_reference_id")
      .eq("id", voice.kyc_verification_id)
      .single();
    kycProvider = verification?.provider ?? null;
    kycSessionId = verification?.external_reference_id ?? null;
  }

  const { data: generation } = await admin
    .from("audio_generations")
    .insert({
      story_id: storyId,
      voice_id: voice.id,
      owner_id: userId,
      status: "processing",
    })
    .select()
    .single();

  try {
    const audio = await generateLongSpeech({
      voiceId: voice.elevenlabs_voice_id,
      text: textMarked,
      languageCode,
      speed,
    });
    const { audio: watermarkedAudio, watermarkId } = await embedWatermark(audio, {
      ownerId: userId,
      voiceId: voice.id,
      generationId: generation!.id,
    });

    const taggedAudio = embedProvenanceTags(watermarkedAudio, {
      generationId: generation!.id,
      voiceId: voice.id,
      kycProvider,
      kycSessionId,
    });

    const path = `${userId}/${generation!.id}.mp3`;
    const { error: uploadError } = await admin.storage
      .from("audio-generations")
      .upload(path, Buffer.from(taggedAudio), {
        contentType: "audio/mpeg",
      });

    if (uploadError) throw uploadError;

    await admin
      .from("audio_generations")
      .update({ status: "ready", audio_url: path, watermark_id: watermarkId })
      .eq("id", generation!.id);
  } catch (err) {
    await admin
      .from("audio_generations")
      .update({ status: "failed" })
      .eq("id", generation!.id);
    throw err;
  }
}

async function loadReadyVoice(admin: SupabaseClient, voiceId: string, userId: string) {
  const { data: voice } = await admin
    .from("voices")
    .select("*")
    .eq("id", voiceId)
    .eq("owner_id", userId)
    .eq("status", "ready")
    .single();

  if (!voice?.elevenlabs_voice_id) {
    throw new Error("voice not ready");
  }
  return voice;
}

/**
 * Создаёт запись (story) из шаблона сказки и синтезирует её первую озвучку.
 * Общая логика для /api/stories/generate (веб, сессия из cookie) и
 * Telegram-бота (userId известен из telegram_links).
 *
 * Самодостаточна с точки зрения авторизации: владение и готовность голоса
 * проверяются здесь же через admin-клиент по userId. Письма (свободный
 * текст) сюда сознательно не проведены — единственный источник текста для
 * TTS это story_templates, контролируемый только сервером.
 */
export async function generateStoryAudio({
  userId,
  voiceId,
  templateId,
  speed = 1.0,
}: GenerateStoryAudioParams): Promise<GenerateStoryAudioResult> {
  if (!ALLOWED_SPEEDS.includes(speed)) {
    throw new Error("invalid speed");
  }

  const admin = createSupabaseAdminClient();
  const voice = await loadReadyVoice(admin, voiceId, userId);

  const { data: template } = await admin
    .from("story_templates")
    .select("*")
    .eq("id", templateId)
    .single();

  if (!template) {
    throw new Error("template not found");
  }

  const { data: story, error: storyError } = await admin
    .from("stories")
    .insert({
      owner_id: userId,
      kind: "fairy_tale",
      title: template.title,
      text: template.text_plain,
      template_id: template.id,
    })
    .select()
    .single();

  if (storyError || !story) {
    throw new Error(storyError?.message ?? "failed to create story");
  }

  await synthesizeAndStoreGeneration(admin, {
    userId,
    storyId: story.id,
    voice,
    textMarked: template.text_marked,
    languageCode: template.language,
    speed,
  });

  return { storyId: story.id };
}

export interface AddStoryVoiceParams {
  userId: string;
  storyId: string;
  voiceId: string;
  speed?: number;
}

/**
 * Добавляет ещё одну озвучку уже существующей сказки/письма другим голосом
 * (не создаёт новую строку stories) — аналог generateChapterAudio() для
 * глав книг: тексту (story) может соответствовать несколько
 * audio_generations с разными voice_id, и все они остаются доступны
 * одновременно, а не заменяют друг друга.
 */
export async function addStoryVoice({
  userId,
  storyId,
  voiceId,
  speed = 1.0,
}: AddStoryVoiceParams): Promise<GenerateStoryAudioResult> {
  if (!ALLOWED_SPEEDS.includes(speed)) {
    throw new Error("invalid speed");
  }

  const admin = createSupabaseAdminClient();
  const voice = await loadReadyVoice(admin, voiceId, userId);

  const { data: story } = await admin
    .from("stories")
    .select("*")
    .eq("id", storyId)
    .eq("owner_id", userId)
    .single();

  if (!story) {
    throw new Error("story not found");
  }

  // Сказки из шаблона несут готовую TTS-разметку (интонационные теги,
  // ударения) в story_templates.text_marked. У писем (kind = "letter")
  // своего текста, введённого пользователем, разметки нет и взять её
  // неоткуда — озвучиваем как есть, обычным текстом (stories.text), без
  // тегов и ударений. Хуже с точки зрения выразительности речи, но лучше,
  // чем совсем не иметь возможности озвучить уже созданное письмо.
  let textMarked = story.text;
  let languageCode = "ru";
  if (story.template_id) {
    const { data: template } = await admin
      .from("story_templates")
      .select("*")
      .eq("id", story.template_id)
      .single();

    if (!template) {
      throw new Error("template not found");
    }
    textMarked = template.text_marked;
    languageCode = template.language;
  }

  await synthesizeAndStoreGeneration(admin, {
    userId,
    storyId: story.id,
    voice,
    textMarked,
    languageCode,
    speed,
  });

  return { storyId: story.id };
}
