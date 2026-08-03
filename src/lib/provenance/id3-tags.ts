import "server-only";
import NodeID3 from "node-id3";

export interface ProvenanceInfo {
  generationId: string;
  voiceId: string;
  kycProvider: string | null;
  /** Идентификатор сессии верификации у внешнего KYC-провайдера (например, Didit). */
  kycSessionId: string | null;
}

/**
 * Встраивает в mp3 ID3-теги с идентификаторами для трассировки происхождения
 * записи — БЕЗ обращения к какому-либо сервису при чтении.
 *
 * Зачем именно так: цель — в случае утечки/жалобы выйти на человека,
 * который загрузил исходный образец голоса и прошёл KYC (это не обязательно
 * владелец голоса — например, для голоса покойного родственника загружает
 * и подтверждает личность внук/внучка). Если Науз к этому моменту не
 * существует, kycSessionId сам по себе передаётся KYC-провайдеру (Didit) по
 * официальному запросу — они обязаны хранить верификационные записи по
 * AML-регуляциям годами, независимо от нашей судьбы. Это надёжнее, чем
 * ссылка на наш собственный сайт/API, которых может уже не быть.
 *
 * Осознанно не подписывается собственным ключом (в духе C2PA) — тогда
 * нужен был бы durable-канал публикации публичного ключа, независимый от
 * Науз, а тут в этом нет необходимости: доверенным якорем выступает сам
 * KYC-провайдер, а не подпись Науз.
 */
export function embedProvenanceTags(
  audio: ArrayBuffer,
  info: ProvenanceInfo,
): ArrayBuffer {
  const tags: NodeID3.Tags = {
    comment: {
      language: "rus",
      text:
        "Науз: аудио сгенерировано голосовым слепком, клонированным после подтверждения личности загрузившего образец. " +
        "См. TXXX-теги nauz_generation_id / kyc_provider / kyc_session_id для трассировки происхождения.",
    },
    userDefinedText: [
      { description: "nauz_generation_id", value: info.generationId },
      { description: "nauz_voice_id", value: info.voiceId },
      { description: "kyc_provider", value: info.kycProvider ?? "unknown" },
      { description: "kyc_session_id", value: info.kycSessionId ?? "unknown" },
    ],
  };

  try {
    const result = NodeID3.write(tags, Buffer.from(audio));
    return result.buffer.slice(
      result.byteOffset,
      result.byteOffset + result.byteLength,
    ) as ArrayBuffer;
  } catch (err) {
    // Не должно блокировать доставку сказки пользователю — при сбое
    // просто отдаём аудио без тегов провенанса.
    console.error("embedProvenanceTags: node-id3 write failed", err);
    return audio;
  }
}
