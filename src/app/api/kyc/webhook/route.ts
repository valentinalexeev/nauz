import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getKycProvider } from "@/lib/kyc/provider";

/**
 * Вебхук от внешнего KYC-провайдера с результатом проверки личности.
 * После approve голос переводится в статус kyc_approved и становится
 * доступен для клонирования (см. /api/voices/[id]/clone).
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-kyc-signature");

  const provider = getKycProvider();
  let event;
  try {
    event = provider.parseWebhook(rawBody, signature);
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  const { data: verification, error: fetchError } = await admin
    .from("kyc_verifications")
    .update({ status: event.status, updated_at: new Date().toISOString() })
    .eq("external_reference_id", event.externalReferenceId)
    .select()
    .single();

  if (fetchError || !verification) {
    return NextResponse.json({ error: "verification not found" }, { status: 404 });
  }

  if (event.status === "approved") {
    await admin
      .from("voices")
      .update({ status: "kyc_approved", kyc_verification_id: verification.id })
      .eq("id", verification.voice_id);
  } else if (event.status === "rejected") {
    await admin
      .from("voices")
      .update({ status: "failed" })
      .eq("id", verification.voice_id);
  }

  return NextResponse.json({ ok: true });
}
