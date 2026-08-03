import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateSpeech } from "@/lib/elevenlabs/client";
import { splitTextForTts } from "@/lib/elevenlabs/chunk-text";
import { embedWatermark } from "@/lib/watermark";
import { embedProvenanceTags } from "@/lib/provenance/id3-tags";
import { ALLOWED_SPEEDS } from "@/lib/stories/speed-options";

/**
 * Генерирует речь для целого текста, разбивая его на куски под лимит
 * ElevenLabs (см. splitTextForTts) и склеивая результат — каждый следующий
 * кусок получает previous_request_ids от предыдущего и next_text от
 * следующего, чтобы интонация не обрывалась на стыках. Для текста короче
 * лимита (сейчас — все наши шаблоны) выполняется один обычный запрос без
 * изменений в поведении.
 */
async function generateLongSpeech(params: {
  voiceId: string;
  text: string;
  languageCode: string;
  speed: number;
}): Promise<ArrayBuffer> {
  const chunks = splitTextForTts(params.text);
  if (chunks.length === 1) {
    const { audio } = await generateSpeech({ ...params, text: chunks[0] });
    return audio;
  }

  const parts: Buffer[] = [];
  let previousRequestId: string | undefined;

  for (let i = 0; i < chunks.length; i++) {
    const { audio, requestId } = await generateSpeech({
      ...params,
      text: chunks[i],
      previousText: i > 0 ? chunks[i - 1] : undefined,
      nextText: i < chunks.length - 1 ? chunks[i + 1] : undefined,
      previousRequestIds: previousRequestId ? [previousRequestId] : undefined,
    });
    parts.push(Buffer.from(audio));
    previousRequestId = requestId ?? undefined;
  }

  const merged = Buffer.concat(parts);
  return merged.buffer.slice(merged.byteOffset, merged.byteOffset + merged.byteLength);
}

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
 * Создаёт запись (story) из шаблона сказки и синтезирует аудио выбранным
 * голосом. Общая логика для /api/stories/generate (веб, сессия из cookie)
 * и Telegram-бота (userId известен из telegram_links).
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

  const { data: generation } = await admin
    .from("audio_generations")
    .insert({
      story_id: story.id,
      voice_id: voice.id,
      owner_id: userId,
      status: "processing",
    })
    .select()
    .single();

  try {
    const audio = await generateLongSpeech({
      voiceId: voice.elevenlabs_voice_id,
      text: template.text_marked,
      languageCode: template.language,
      speed,
    });
    const { audio: watermarkedAudio, watermarkId } = await embedWatermark(
      audio,
      {
        ownerId: userId,
        voiceId: voice.id,
        generationId: generation!.id,
      },
    );

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

  return { storyId: story.id };
}
