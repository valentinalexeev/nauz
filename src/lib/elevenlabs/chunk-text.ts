// eleven_v3 ограничивает один запрос 5000 символами (~5 минут аудио) —
// см. https://elevenlabs.io/docs/overview/models. Держим запас от жёсткого
// лимита на случай неточного подсчёта символов (эмодзи, спецсимволы).
export const ELEVENLABS_V3_MAX_CHARS = 5000;
const DEFAULT_CHUNK_TARGET = 4500;

/**
 * Бьёт длинный текст на куски под лимит ElevenLabs по границам предложений
 * — никогда не режет посреди предложения (и тем более посреди тега
 * [emotion] из разметки eleven_v3). Для текста короче лимита возвращает
 * его же одним куском без изменений — большинство наших шаблонов сюда и
 * попадают, поведение для них не меняется.
 */
export function splitTextForTts(
  text: string,
  maxChars: number = DEFAULT_CHUNK_TARGET,
): string[] {
  if (text.length <= maxChars) return [text];

  // Разбиваем на предложения, сохраняя знак препинания и пробелы после него.
  const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) ?? [text];

  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      // Само предложение длиннее лимита (редкий случай) — режем по словам.
      pushCurrent();
      let rest = sentence;
      while (rest.length > maxChars) {
        let cut = rest.lastIndexOf(" ", maxChars);
        if (cut <= 0) cut = maxChars;
        chunks.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
      }
      current = rest;
      continue;
    }

    if (current.length + sentence.length > maxChars) {
      pushCurrent();
    }
    current += sentence;
  }
  pushCurrent();

  return chunks;
}
