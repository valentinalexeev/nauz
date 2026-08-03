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

  const provider = getKycProvider();
  let event;
  try {
    event = provider.parseWebhook(rawBody, request.headers);
  } catch (err) {
    // Раньше ошибка проглатывалась молча — при разборе проблем с реальным
    // провайдером (Didit) не было видно даже причины 400 в логах Vercel.
    console.error("kyc webhook: parseWebhook failed", err);
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  if (event === null) {
    // Событие без смены статуса (например, Didit "data.updated") — не ошибка.
    return NextResponse.json({ ok: true });
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

    // Сохраняем портрет только с ПЕРВОЙ одобренной верификации пользователя
    // (значит, это был полный KYC, а не уже облегчённая переверификация) —
    // он нужен для лёгкой биометрической переверификации на следующих
    // голосах того же человека (см. src/lib/voices/start-kyc.ts).
    const { data: profile } = await admin
      .from("profiles")
      .select("kyc_reference_portrait_path")
      .eq("id", verification.user_id)
      .single();

    if (
      !profile?.kyc_reference_portrait_path &&
      provider.fetchReferencePortrait &&
      verification.external_reference_id
    ) {
      const portraitBase64 = await provider
        .fetchReferencePortrait(verification.external_reference_id)
        .catch(() => null);

      if (portraitBase64) {
        const path = `${verification.user_id}/portrait.jpg`;
        const { error: uploadError } = await admin.storage
          .from("kyc-portraits")
          .upload(path, Buffer.from(portraitBase64, "base64"), {
            contentType: "image/jpeg",
            upsert: true,
          });
        if (!uploadError) {
          await admin
            .from("profiles")
            .update({ kyc_reference_portrait_path: path })
            .eq("id", verification.user_id);
        }
      }
    }
  } else if (event.status === "rejected") {
    await admin
      .from("voices")
      .update({ status: "failed" })
      .eq("id", verification.voice_id);
  }

  return NextResponse.json({ ok: true });
}
