import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { cloneVoice, extensionForAudioMimeType } from "@/lib/elevenlabs/client";

export interface CloneVoiceSampleParams {
  userId: string;
  voiceId: string;
  /** Один или несколько образцов (несколько — по одному на разный текст). */
  audio: Blob[];
}

export interface CloneVoiceSampleResult {
  status: "ready";
  elevenlabsVoiceId: string;
}

/**
 * Принимает образцы голоса и клонирует их в ElevenLabs. Общая логика для
 * /api/voices/[id]/clone (веб, сессия из cookie) и Telegram-бота (userId
 * известен из telegram_links, без живой Supabase-сессии).
 *
 * Самодостаточна с точки зрения авторизации: владение и допустимый статус
 * голоса (kyc_approved/failed) проверяются здесь же через admin-клиент по
 * userId, вызывающей стороне не нужно повторять эту проверку.
 */
export async function cloneVoiceSample({
  userId,
  voiceId,
  audio,
}: CloneVoiceSampleParams): Promise<CloneVoiceSampleResult> {
  const admin = createSupabaseAdminClient();

  const { data: voice, error: fetchError } = await admin
    .from("voices")
    .select("*")
    .eq("id", voiceId)
    .eq("owner_id", userId)
    .in("status", ["kyc_approved", "failed"])
    .single();

  if (fetchError || !voice) {
    throw new Error("voice not ready for cloning");
  }

  const { data: owner } = await admin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .single();

  await admin.from("voices").update({ status: "cloning" }).eq("id", voice.id);

  try {
    // Папка вместо одного файла — образцов теперь может быть несколько
    // (см. voice-recorder.tsx). При удалении голоса (route.ts) все файлы
    // под этим префиксом вычищаются через storage.list().
    const samplePrefix = `${userId}/${voice.id}`;
    const uploadResults = await Promise.all(
      audio.map((blob, i) =>
        admin.storage
          .from("voice-samples")
          .upload(
            `${samplePrefix}/sample-${i}.${extensionForAudioMimeType(blob.type)}`,
            blob,
            { contentType: blob.type || "audio/webm", upsert: true },
          ),
      ),
    );
    const uploadError = uploadResults.find((r) => r.error)?.error;
    if (uploadError) throw uploadError;

    // Имя в ElevenLabs должно позволять сопоставить голос с пользователем
    // Науз — иначе в списке голосов аккаунта видно только ярлык вида
    // "Папа", без понимания, чей это профиль.
    const { voiceId: elevenlabsVoiceId } = await cloneVoice({
      name: `Науз: ${owner?.email ?? userId} — ${voice.label}`,
      files: audio,
    });

    await admin
      .from("voices")
      .update({
        status: "ready",
        elevenlabs_voice_id: elevenlabsVoiceId,
        sample_audio_path: samplePrefix,
      })
      .eq("id", voice.id);

    return { status: "ready", elevenlabsVoiceId };
  } catch (err) {
    await admin.from("voices").update({ status: "failed" }).eq("id", voice.id);
    throw err;
  }
}
