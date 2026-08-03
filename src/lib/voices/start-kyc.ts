import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getKycProvider } from "@/lib/kyc/provider";

export interface StartKycForVoiceParams {
  userId: string;
  voiceId: string;
  email: string;
}

export interface StartKycForVoiceResult {
  /**
   * null, если верификация не нужна — у пользователя уже есть одобренный
   * KYC (переиспользован для этого голоса), достаточно формального согласия,
   * которое уже собрано чекбоксом на форме создания голоса.
   */
  redirectUrl: string | null;
}

/**
 * Запускает подтверждение личности для голоса. KYC имеет смысл проходить
 * один раз на человека, а не на каждый голос — платная верификация у
 * провайдера (Didit) не переделывается повторно: если у пользователя уже
 * есть одобренная верификация, новый голос сразу помечается kyc_approved
 * со ссылкой на неё же (провенанс не теряется), без обращения к провайдеру.
 *
 * Общая логика для /api/kyc/start (веб, сессия из cookie) и Telegram-бота
 * (userId известен из telegram_links, без живой Supabase-сессии).
 */
export async function startKycForVoice({
  userId,
  voiceId,
  email,
}: StartKycForVoiceParams): Promise<StartKycForVoiceResult> {
  const admin = createSupabaseAdminClient();

  const { data: approved } = await admin
    .from("kyc_verifications")
    .select("provider, external_reference_id")
    .eq("user_id", userId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (approved) {
    const { data: verification, error } = await admin
      .from("kyc_verifications")
      .insert({
        voice_id: voiceId,
        user_id: userId,
        provider: approved.provider,
        external_reference_id: approved.external_reference_id,
        status: "approved",
      })
      .select()
      .single();

    if (error || !verification) {
      throw new Error(error?.message ?? "failed to reuse kyc verification");
    }

    await admin
      .from("voices")
      .update({ status: "kyc_approved", kyc_verification_id: verification.id })
      .eq("id", voiceId);

    return { redirectUrl: null };
  }

  const provider = getKycProvider();
  const result = await provider.startVerification({ userId, voiceId, email });

  const { error } = await admin.from("kyc_verifications").insert({
    voice_id: voiceId,
    user_id: userId,
    provider: provider.name,
    external_reference_id: result.externalReferenceId,
    status: "pending",
  });

  if (error) {
    throw new Error(error.message);
  }

  return { redirectUrl: result.redirectUrl };
}
