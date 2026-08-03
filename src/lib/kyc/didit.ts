import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { KycProvider, KycWebhookEvent } from "@/lib/kyc/provider";

const DIDIT_API_BASE = "https://verification.didit.me";

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
 * ⚠️ Официальные страницы docs.didit.me/reference/* на момент написания
 * отдавали 404 — заголовок подписи (X-Signature-V2) и формат HMAC
 * восстановлены из смежной документации/блога Didit и не проверены на
 * реальном трафике. Если вебхук не проходит проверку подписи — первым делом
 * сверить точное имя заголовка и алгоритм в актуальном дашборде Didit.
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
    if (!signature) {
      throw new Error("missing X-Signature-V2 header");
    }

    const expected = createHmac("sha256", webhookSecret()).update(rawBody).digest("hex");
    if (!timingSafeEqualHex(signature, expected)) {
      throw new Error("invalid webhook signature");
    }

    const payload = JSON.parse(rawBody) as { session_id?: string; status?: string };
    if (!payload.session_id || !payload.status) {
      throw new Error("unexpected webhook payload shape");
    }

    return {
      externalReferenceId: payload.session_id,
      status: mapStatus(payload.status),
    };
  },
};
