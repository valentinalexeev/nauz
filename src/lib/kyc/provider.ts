import "server-only";

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
  /** Разбирает и валидирует входящий вебхук от провайдера */
  parseWebhook(rawBody: string, signature: string | null): KycWebhookEvent;
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
    // TODO: добавить реального провайдера, например:
    // case "beorg": return beorgKycProvider;
    default:
      return stubKycProvider;
  }
}
