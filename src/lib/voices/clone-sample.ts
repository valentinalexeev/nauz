import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { cloneVoice, extensionForAudioMimeType } from "@/lib/elevenlabs/client";

// Vercel-функции жёстко ограничивают тело входящего запроса (~4.5MB) — это
// платформенный лимит, не обходится настройками Next.js. Несколько
// образцов по 60 сек в одном FormData легко его превышают, поэтому каждый
// дубль загружается ОТДЕЛЬНЫМ запросом сразу после записи (см.
// uploadVoiceSample), а финальный вызов ElevenLabs (finishVoiceClone)
// читает уже загруженные файлы из Supabase Storage сам — это исходящий
// запрос с сервера, лимита на него нет.

async function assertVoiceCloneable(
  admin: SupabaseClient,
  userId: string,
  voiceId: string,
) {
  const { data: voice, error } = await admin
    .from("voices")
    .select("*")
    .eq("id", voiceId)
    .eq("owner_id", userId)
    .in("status", ["kyc_approved", "failed"])
    .single();

  if (error || !voice) {
    throw new Error("voice not ready for cloning");
  }
  return voice;
}

export interface UploadVoiceSampleParams {
  userId: string;
  voiceId: string;
  audio: Blob;
  /** Порядковый номер дубля в текущей сессии записи, начиная с 0. */
  index: number;
}

export async function uploadVoiceSample({
  userId,
  voiceId,
  audio,
  index,
}: UploadVoiceSampleParams): Promise<{ path: string }> {
  const admin = createSupabaseAdminClient();
  await assertVoiceCloneable(admin, userId, voiceId);

  const prefix = `${userId}/${voiceId}`;

  if (index === 0) {
    // Новая сессия записи — чистим файлы от прошлой (например, неудачной)
    // попытки, чтобы finishVoiceClone не подхватил лишние старые дубли.
    const { data: existing } = await admin.storage.from("voice-samples").list(prefix);
    const stalePaths = (existing ?? []).map((f) => `${prefix}/${f.name}`);
    if (stalePaths.length) {
      await admin.storage.from("voice-samples").remove(stalePaths);
    }
  }

  const path = `${prefix}/sample-${index}.${extensionForAudioMimeType(audio.type)}`;
  const { error } = await admin.storage.from("voice-samples").upload(path, audio, {
    contentType: audio.type || "audio/webm",
    upsert: true,
  });
  if (error) throw new Error(error.message);

  return { path };
}

export interface FinishVoiceCloneParams {
  userId: string;
  voiceId: string;
}

export interface CloneVoiceSampleResult {
  status: "ready";
  elevenlabsVoiceId: string;
}

/**
 * Забирает все ранее загруженные (uploadVoiceSample) образцы голоса и
 * клонирует их в ElevenLabs.
 */
export async function finishVoiceClone({
  userId,
  voiceId,
}: FinishVoiceCloneParams): Promise<CloneVoiceSampleResult> {
  const admin = createSupabaseAdminClient();
  const voice = await assertVoiceCloneable(admin, userId, voiceId);

  const prefix = `${userId}/${voice.id}`;
  const { data: files } = await admin.storage.from("voice-samples").list(prefix);
  const samplePaths = (files ?? []).map((f) => `${prefix}/${f.name}`);
  if (!samplePaths.length) {
    throw new Error("no uploaded samples found");
  }

  const { data: owner } = await admin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .single();

  await admin.from("voices").update({ status: "cloning" }).eq("id", voice.id);

  try {
    const audio = await Promise.all(
      samplePaths.map(async (path) => {
        const { data, error } = await admin.storage.from("voice-samples").download(path);
        if (error || !data) {
          throw new Error(error?.message ?? `failed to download ${path}`);
        }
        return data;
      }),
    );

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
        sample_audio_path: prefix,
      })
      .eq("id", voice.id);

    return { status: "ready", elevenlabsVoiceId };
  } catch (err) {
    await admin.from("voices").update({ status: "failed" }).eq("id", voice.id);
    throw err;
  }
}

/**
 * Однократная загрузка + клонирование одним вызовом — для Telegram-бота,
 * где голос приходит одним сообщением и HTTP-лимит Vercel не участвует
 * (бот дёргает эту функцию напрямую в том же процессе, не через route).
 */
export async function cloneVoiceSample(params: {
  userId: string;
  voiceId: string;
  audio: Blob;
}): Promise<CloneVoiceSampleResult> {
  await uploadVoiceSample({ ...params, index: 0 });
  return finishVoiceClone(params);
}
