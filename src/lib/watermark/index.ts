import "server-only";
import { randomUUID } from "node:crypto";

/**
 * Встраивание цифрового водяного знака в сгенерированные аудиофайлы.
 *
 * Зачем: голос человека клонируется через ElevenLabs, и файлы, которые
 * сервис отдаёт наружу, не должны становиться источником для повторного
 * клонирования голоса третьими лицами. Водяной знак решает две задачи:
 *  1. Позволяет доказать происхождение файла (какой аккаунт, какой voiceId,
 *     когда сгенерирован) — на случай споров об авторстве/согласии.
 *  2. Затрудняет использование файла как чистого сырья для клонирования
 *     голоса на стороннем сервисе (маскирующий шум за пределами речевого
 *     диапазона восприятия не убирается простым ресемплингом/сжатием).
 *
 * Реализация встраивания — пока заглушка (проставляет метаданные и
 * идентификатор), реальная схема должна быть добавлена одним из способов:
 *  - Собственный алгоритм на основе spread-spectrum / echo hiding поверх
 *    PCM-потока (например через ffmpeg/sox в отдельном сервисе).
 *  - Готовое решение вроде AudioSeal (Meta) или Resemble AI PerTh —
 *    нейросетевые watermarking-модели, устойчивые к сжатию и обрезке.
 *  - Проверить, включает ли тарифный план ElevenLabs собственный
 *    watermarking сгенерированного аудио (у части AI-провайдей он есть
 *    "из коробки") — тогда этот модуль становится дополнительным слоем.
 *
 * До внедрения реальной схемы этот модуль — единая точка интеграции:
 * весь код проекта работает через embedWatermark()/verifyWatermark(),
 * поэтому подмена заглушки на боевую реализацию не потребует правок
 * в остальном приложении.
 */

export interface WatermarkPayload {
  watermarkId: string;
  ownerId: string;
  voiceId: string;
  generationId: string;
  issuedAt: string;
}

export interface EmbedWatermarkResult {
  audio: ArrayBuffer;
  watermarkId: string;
}

export async function embedWatermark(
  audio: ArrayBuffer,
  payload: Omit<WatermarkPayload, "watermarkId" | "issuedAt">,
): Promise<EmbedWatermarkResult> {
  const watermarkId = randomUUID();

  // TODO: заменить на реальное встраивание сигнала в аудио-поток.
  // Пока watermarkId сохраняется только в БД (audio_generations.watermark_id)
  // и должен трактоваться как "мягкая" метка до внедрения аудио-схемы.
  void payload;

  return { audio, watermarkId };
}

export interface VerifyWatermarkResult {
  found: boolean;
  watermarkId?: string;
}

export async function verifyWatermark(
  _audio: ArrayBuffer,
): Promise<VerifyWatermarkResult> {
  // TODO: реализовать извлечение сигнала после внедрения боевой схемы.
  return { found: false };
}
