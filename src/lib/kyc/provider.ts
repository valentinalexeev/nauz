import "server-only";
import { diditKycProvider } from "@/lib/kyc/didit";

/**
 * Абстракция над внешним KYC-сервисом (например, аналогичным
 * https://beorg.ru/kak-uznat-svoego-klienta-kyc/), который подтверждает,
 * что человек, загрузивший образец голоса, — тот, за кого себя выдаёт,
 * и правда даёт согласие на клонирование своего голоса.
 *
 * Конкретный провайдер подключается через переменные окружения
 * KYC_PROVIDER / KYC_API_KEY / KYC_WEBHOOK_SECRET и должен реализовать
 * этот интерфейс. Ниже — заглушка для разработки без реального провайдера.
 */

export interface StartVerificationParams {
  userId: string;
  voiceId: string;
  /** email пользователя, для которого запускается проверка личности */
  email: string;
  /**
   * Портрет (base64) из ПРОШЛОЙ одобренной верификации того же пользователя.
   * Если провайдер это поддерживает, вместо полного KYC (документ + селфи)
   * достаточно лёгкой биометрической переверификации (liveness + face-match
   * против этого портрета) — так KYC проходится по факту один раз на
   * человека, а не на каждый голос. Провайдеры, не умеющие в reverify,
   * просто игнорируют это поле и всегда делают полный KYC.
   */
  reverifyPortraitBase64?: string;
}

export interface StartVerificationResult {
  /** Идентификатор проверки во внешней системе */
  externalReferenceId: string;
  /** Ссылка, куда нужно перенаправить пользователя для прохождения проверки */
  redirectUrl: string;
}

export type KycWebhookEvent = {
  externalReferenceId: string;
  status: "approved" | "rejected" | "pending";
  reason?: string;
};

export interface KycProvider {
  name: string;
  startVerification(
    params: StartVerificationParams,
  ): Promise<StartVerificationResult>;
  /**
   * Разбирает и валидирует входящий вебхук от провайдера. Принимает все
   * заголовки запроса, а не один конкретный — у разных провайдеров подпись
   * лежит в разных заголовках (см. src/lib/kyc/didit.ts: X-Signature-V2).
   *
   * Возвращает null для событий, которые не несут смену статуса (например,
   * Didit шлёт ещё и "data.updated") — это не ошибка, роут должен просто
   * ответить 200 и ничего не делать, а не отклонять как invalid payload.
   */
  parseWebhook(rawBody: string, headers: Headers): KycWebhookEvent | null;
  /**
   * Достаёт портрет (base64) из уже завершённой верификации — чтобы
   * сохранить его для последующей лёгкой переверификации (см.
   * StartVerificationParams.reverifyPortraitBase64). Провайдеры без
   * поддержки reverify этот метод не реализуют.
   */
  fetchReferencePortrait?(externalReferenceId: string): Promise<string | null>;
}

/**
 * Заглушка для локальной разработки и раннего этапа продукта — не делает
 * реальную проверку личности. Заменить на боевого провайдера перед запуском.
 */
export const stubKycProvider: KycProvider = {
  name: "stub",
  async startVerification({ voiceId }) {
    return {
      externalReferenceId: `stub_${voiceId}`,
      redirectUrl: `/voices/${voiceId}/kyc/stub`,
    };
  },
  parseWebhook(rawBody) {
    const body = JSON.parse(rawBody) as KycWebhookEvent;
    return body;
  },
};

export function getKycProvider(): KycProvider {
  const provider = process.env.KYC_PROVIDER;
  switch (provider) {
    case "didit":
      return diditKycProvider;
    default:
      return stubKycProvider;
  }
}
