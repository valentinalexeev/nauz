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
 *
 * KYC имеет смысл проходить один раз на человека, а не на каждый голос —
 * если у пользователя уже есть сохранённый портрет из прошлой одобренной
 * верификации, передаём его провайдеру: тот (если умеет) заменяет полный
 * KYC на лёгкую биометрическую переверификацию (см. StartVerificationParams
 * .reverifyPortraitBase64 и Didit-провайдер).
 */
export async function startKycForVoice({
  userId,
  voiceId,
  email,
}: StartKycForVoiceParams): Promise<{ redirectUrl: string }> {
  const provider = getKycProvider();
  const admin = createSupabaseAdminClient();

  let reverifyPortraitBase64: string | undefined;
  const { data: profile } = await admin
    .from("profiles")
    .select("kyc_reference_portrait_path")
    .eq("id", userId)
    .single();

  if (profile?.kyc_reference_portrait_path) {
    const { data: file } = await admin.storage
      .from("kyc-portraits")
      .download(profile.kyc_reference_portrait_path);
    if (file) {
      reverifyPortraitBase64 = Buffer.from(await file.arrayBuffer()).toString(
        "base64",
      );
    }
  }

  const result = await provider.startVerification({
    userId,
    voiceId,
    email,
    reverifyPortraitBase64,
  });
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
