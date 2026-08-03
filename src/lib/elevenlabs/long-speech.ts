import "server-only";
import { generateSpeech } from "@/lib/elevenlabs/client";
import { splitTextForTts } from "@/lib/elevenlabs/chunk-text";

/**
 * Генерирует речь для целого текста, разбивая его на куски под лимит
 * ElevenLabs (см. splitTextForTts) и склеивая результат — каждый следующий
 * кусок получает previous_request_ids от предыдущего и next_text от
 * следующего, чтобы интонация не обрывалась на стыках. Для текста короче
 * лимита выполняется один обычный запрос без изменений в поведении.
 *
 * Общая логика для сказок (src/lib/stories/generate-audio.ts) и глав книг
 * (src/lib/books/generate-chapter-audio.ts).
 */
export async function generateLongSpeech(params: {
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
