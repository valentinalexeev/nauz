import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateSpeech } from "@/lib/elevenlabs/client";
import { embedWatermark } from "@/lib/watermark";
import { ALLOWED_SPEEDS } from "@/lib/stories/speed-options";

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
    const audio = await generateSpeech({
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

    const path = `${userId}/${generation!.id}.mp3`;
    const { error: uploadError } = await admin.storage
      .from("audio-generations")
      .upload(path, Buffer.from(watermarkedAudio), {
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
