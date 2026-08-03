import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { cloneVoice, extensionForAudioMimeType } from "@/lib/elevenlabs/client";

export interface CloneVoiceSampleParams {
  userId: string;
  voiceId: string;
  audio: Blob;
}

export interface CloneVoiceSampleResult {
  status: "ready";
  elevenlabsVoiceId: string;
}

/**
 * Принимает образец голоса и клонирует его в ElevenLabs. Общая логика для
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
    const samplePath = `${userId}/${voice.id}.${extensionForAudioMimeType(audio.type)}`;
    const { error: uploadError } = await admin.storage
      .from("voice-samples")
      .upload(samplePath, audio, {
        contentType: audio.type || "audio/webm",
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // Имя в ElevenLabs должно позволять сопоставить голос с пользователем
    // Науз — иначе в списке голосов аккаунта видно только ярлык вида
    // "Папа", без понимания, чей это профиль.
    const { voiceId: elevenlabsVoiceId } = await cloneVoice({
      name: `Науз: ${owner?.email ?? userId} — ${voice.label}`,
      files: [audio],
    });

    await admin
      .from("voices")
      .update({
        status: "ready",
        elevenlabs_voice_id: elevenlabsVoiceId,
        sample_audio_path: samplePath,
      })
      .eq("id", voice.id);

    return { status: "ready", elevenlabsVoiceId };
  } catch (err) {
    await admin.from("voices").update({ status: "failed" }).eq("id", voice.id);
    throw err;
  }
}
