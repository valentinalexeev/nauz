import "server-only";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

function apiKey() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY не задан");
  return key;
}

export interface CloneVoiceParams {
  name: string;
  description?: string;
  /** Аудио-файлы образца голоса (webm/mp3/wav) */
  files: Blob[];
}

export interface CloneVoiceResult {
  voiceId: string;
}

/**
 * Создаёт голосовой слепок (Instant/Professional Voice Cloning) из
 * загруженных пользователем образцов. Вызывать ТОЛЬКО после того, как
 * пройдена KYC-верификация и получено явное согласие пользователя —
 * см. src/lib/kyc/provider.ts.
 */
export async function cloneVoice({
  name,
  description,
  files,
}: CloneVoiceParams): Promise<CloneVoiceResult> {
  const form = new FormData();
  form.set("name", name);
  if (description) form.set("description", description);
  files.forEach((file, i) => form.append("files", file, `sample-${i}.wav`));

  const res = await fetch(`${ELEVENLABS_API_BASE}/voices/add`, {
    method: "POST",
    headers: { "xi-api-key": apiKey() },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`ElevenLabs cloneVoice failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { voice_id: string };
  return { voiceId: data.voice_id };
}

export interface GenerateSpeechParams {
  voiceId: string;
  text: string;
  modelId?: string;
}

/**
 * Генерирует аудио из текста выбранным голосом.
 * Возвращает необработанный аудио-поток (mp3) — перед сохранением
 * его нужно прогнать через src/lib/watermark для встраивания
 * идентификационной метки (см. requestGenerationAudio в app/api).
 */
export async function generateSpeech({
  voiceId,
  text,
  modelId = "eleven_multilingual_v2",
}: GenerateSpeechParams): Promise<ArrayBuffer> {
  const res = await fetch(`${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: { stability: 0.5, similarity_boost: 0.85 },
    }),
  });

  if (!res.ok) {
    throw new Error(`ElevenLabs generateSpeech failed: ${res.status} ${await res.text()}`);
  }

  return res.arrayBuffer();
}

/**
 * Удаляет голосовой слепок из ElevenLabs — вызывается при отзыве
 * пользователем согласия на использование голоса.
 */
export async function deleteVoice(voiceId: string): Promise<void> {
  const res = await fetch(`${ELEVENLABS_API_BASE}/voices/${voiceId}`, {
    method: "DELETE",
    headers: { "xi-api-key": apiKey() },
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs deleteVoice failed: ${res.status} ${await res.text()}`);
  }
}
