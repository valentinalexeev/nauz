// Общий список допустимых скоростей речи — используется и на вебе
// (/stories/new), и в Telegram-боте, и при валидации в generateStoryAudio.
// Пять стопов 0.8/0.9/1.0/1.1/1.2 (шаг 0.1 в обе стороны от обычной),
// в пределах допустимого диапазона API ElevenLabs (0.7–1.2).
export const SPEED_OPTIONS = [
  { value: 0.8, label: "0.8× — медленнее" },
  { value: 0.9, label: "0.9× — чуть медленнее" },
  { value: 1.0, label: "1.0× — обычная" },
  { value: 1.1, label: "1.1× — чуть быстрее" },
  { value: 1.2, label: "1.2× — быстрее" },
] as const;

export const ALLOWED_SPEEDS: number[] = SPEED_OPTIONS.map((o) => o.value);
