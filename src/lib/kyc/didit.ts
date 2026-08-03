import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { KycProvider, KycWebhookEvent } from "@/lib/kyc/provider";

const DIDIT_API_BASE = "https://verification.didit.me";
const WEBHOOK_MAX_AGE_SECONDS = 300;

function apiKey(): string {
  const key = process.env.DIDIT_API_KEY;
  if (!key) throw new Error("DIDIT_API_KEY не задан");
  return key;
}

function workflowId(): string {
  const id = process.env.DIDIT_WORKFLOW_ID;
  if (!id) throw new Error("DIDIT_WORKFLOW_ID не задан");
  return id;
}

function webhookSecret(): string {
  const secret = process.env.DIDIT_WEBHOOK_SECRET;
  if (!secret) throw new Error("DIDIT_WEBHOOK_SECRET не задан");
  return secret;
}

function siteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SITE_URL не задан");
  return url;
}

/** Constant-time сравнение двух hex-строк — устойчиво к timing-атакам. */
function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Рекурсивно пересобирает объект с ключами в отсортированном порядке —
 * ровно как Python `json.dumps(..., sort_keys=True)`, которым Didit считает
 * подпись на своей стороне. Порядок элементов в массивах не трогаем.
 * Числа в JS не различают int/float на уровне типа (в отличие от Python),
 * поэтому JSON.stringify(5.0) и так даёт "5" — этап process_value из
 * официального примера Didit для нас не нужен, JS уже ведёт себя так.
 */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/** Компактная сериализация — как Python separators=(",", ":"), без экранирования не-ASCII. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

/**
 * Didit присылает статусы в своей номенклатуре ("Approved"/"Declined"/...),
 * а не в нашей ("approved"/"rejected"/"pending") — остальные промежуточные
 * статусы (Not Started/In Progress/In Review/Abandoned) трактуем как pending,
 * ждём финального решения.
 */
function mapStatus(status: string): KycWebhookEvent["status"] {
  switch (status) {
    case "Approved":
      return "approved";
    case "Declined":
      return "rejected";
    default:
      return "pending";
  }
}

interface DiditCreateSessionResponse {
  session_id: string;
  url: string;
}

/**
 * Реальный KYC-провайдер через Didit (https://docs.didit.me) — hosted-сессия
 * верификации личности, результат приходит вебхуком на /api/kyc/webhook.
 *
 * Формат подписи (V2) подтверждён по официальному скиллу
 * didit-protocol/skills (skills/didit-verification-management/SKILL.md,
 * раздел "Webhook Events & Signatures"): HMAC-SHA256 не от сырого тела,
 * а от строки `${timestamp}:${canonical_json}`, где canonical_json — JSON
 * с отсортированными ключами и компактными разделителями. Заголовки:
 * X-Signature-V2 (сама подпись) + X-Timestamp (unix-секунды, должен быть
 * не старше 5 минут — защита от replay).
 */
export const diditKycProvider: KycProvider = {
  name: "didit",

  async startVerification({ voiceId, email }) {
    const res = await fetch(`${DIDIT_API_BASE}/v3/session/`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workflow_id: workflowId(),
        vendor_data: voiceId,
        callback: `${siteUrl()}/voices/${voiceId}`,
        // Интерфейс Науз только русский — предвыбираем язык хостед-сессии
        // Didit, чтобы пользователю не пришлось переключать вручную.
        language: "ru",
        // email передаём как metadata для сверки на стороне Didit, если
        // потребуется — сама верификация identity документов не зависит от него.
        metadata: { email },
      }),
    });

    if (!res.ok) {
      throw new Error(`Didit session create failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as DiditCreateSessionResponse;
    return { externalReferenceId: data.session_id, redirectUrl: data.url };
  },

  parseWebhook(rawBody, headers) {
    const signature = headers.get("x-signature-v2");
    const timestamp = headers.get("x-timestamp");
    if (!signature || !timestamp) {
      throw new Error("missing X-Signature-V2 or X-Timestamp header");
    }

    const timestampSeconds = Number(timestamp);
    if (
      !Number.isFinite(timestampSeconds) ||
      Math.abs(Date.now() / 1000 - timestampSeconds) > WEBHOOK_MAX_AGE_SECONDS
    ) {
      throw new Error("webhook timestamp missing, invalid or too old");
    }

    const payload = JSON.parse(rawBody) as {
      session_id?: string;
      status?: string;
      webhook_type?: string;
    };

    const canonical = canonicalJson(payload);
    const expected = createHmac("sha256", webhookSecret())
      .update(`${timestamp}:${canonical}`)
      .digest("hex");

    if (!timingSafeEqualHex(signature, expected)) {
      // Диагностика без утечки PII/секретов: только форма payload, длина
      // секрета и сами хеши (это не чувствительные данные) — чтобы отличить
      // "секрет в Vercel не совпадает с Didit" от "разошёлся алгоритм канонизации".
      console.error("kyc webhook: signature mismatch diagnostics", {
        payloadKeys: Object.keys(payload).sort(),
        secretLength: webhookSecret().length,
        signatureReceived: signature,
        signatureExpected: expected,
        timestamp,
      });
      throw new Error("invalid webhook signature");
    }

    // Didit шлёт ещё и "data.updated" (ручная правка данных ревьюером) —
    // это не смена статуса верификации, нам нечего с этим делать.
    if (payload.webhook_type && payload.webhook_type !== "status.updated") {
      return null;
    }

    if (!payload.session_id || !payload.status) {
      throw new Error("unexpected webhook payload shape");
    }

    return {
      externalReferenceId: payload.session_id,
      status: mapStatus(payload.status),
    };
  },
};
