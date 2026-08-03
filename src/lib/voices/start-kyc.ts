import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getKycProvider } from "@/lib/kyc/provider";

export interface StartKycForVoiceParams {
  userId: string;
  voiceId: string;
  email: string;
}

/**
 * Запускает KYC-верификацию для голоса и создаёт запись в kyc_verifications.
 * Общая логика для /api/kyc/start (веб, сессия из cookie) и Telegram-бота
 * (userId известен из telegram_links, без живой Supabase-сессии).
 */
export async function startKycForVoice({
  userId,
  voiceId,
  email,
}: StartKycForVoiceParams): Promise<{ redirectUrl: string }> {
  const provider = getKycProvider();
  const result = await provider.startVerification({ userId, voiceId, email });

  // service-role клиент: запись верификации создаётся от имени системы
  const admin = createSupabaseAdminClient();
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
