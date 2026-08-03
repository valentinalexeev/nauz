import "server-only";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

function apiKey() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY не задан");
  return key;
}

// Расширение файла должно отражать реальный контейнер записи: например,
// Safari пишет MediaRecorder-вывод в MP4/AAC, а не в WebM/WAV, а голосовые
// сообщения Telegram — в OGG/Opus. Подпись файла не по формату может сбить
// с толку детектор формата на стороне ElevenLabs.
export function extensionForAudioMimeType(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

export interface CloneVoiceParams {
  name: string;
  description?: string;
  /** Аудио-файлы образца голоса (webm/mp3/wav) */
  files: Blob[];
  /** Чистит шум/фон в образце перед клонированием — включено по умолчанию. */
  removeBackgroundNoise?: boolean;
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
  removeBackgroundNoise = true,
}: CloneVoiceParams): Promise<CloneVoiceResult> {
  const form = new FormData();
  form.set("name", name);
  if (description) form.set("description", description);
  form.set("remove_background_noise", String(removeBackgroundNoise));
  files.forEach((file, i) =>
    form.append("files", file, `sample-${i}.${extensionForAudioMimeType(file.type)}`),
  );

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
  /** ISO 639-1, например "ru" — передаётся явно, без угадывания моделью. */
  languageCode: string;
  /** 0.7–1.2, по умолчанию 1.0 (обычная скорость). */
  speed?: number;
  modelId?: string;
  /**
   * Для склейки нескольких кусков длинного текста (см.
   * src/lib/elevenlabs/chunk-text.ts) — соседний текст/request_id помогают
   * ElevenLabs держать интонацию непрерывной на стыке кусков, а не
   * начинать читать "с нуля" каждый следующий. previousText игнорируется,
   * если передан previousRequestIds (см. доки ElevenLabs).
   */
  previousText?: string;
  nextText?: string;
  /** Максимум 3 по ограничению API — на практике передаём один. */
  previousRequestIds?: string[];
}

export interface GenerateSpeechResult {
  audio: ArrayBuffer;
  /** Для previousRequestIds следующего куска при склейке длинных текстов. */
  requestId: string | null;
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
  languageCode,
  speed = 1.0,
  modelId = "eleven_v3",
  previousText,
  nextText,
  previousRequestIds,
}: GenerateSpeechParams): Promise<GenerateSpeechResult> {
  const res = await fetch(`${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      language_code: languageCode,
      voice_settings: { stability: 0.5, similarity_boost: 0.85, speed },
      ...(previousRequestIds?.length
        ? { previous_request_ids: previousRequestIds }
        : previousText
          ? { previous_text: previousText }
          : {}),
      ...(nextText ? { next_text: nextText } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(`ElevenLabs generateSpeech failed: ${res.status} ${await res.text()}`);
  }

  return { audio: await res.arrayBuffer(), requestId: res.headers.get("request-id") };
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
