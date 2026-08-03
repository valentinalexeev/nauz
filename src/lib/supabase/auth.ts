import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Анонимный клиент для одноразовых auth-вызовов на сервере без cookie-сессии
 * (Telegram-бот: отправка/проверка email-OTP). В отличие от createSupabaseAdminClient
 * работает с anon-ключом и не обходит RLS — здесь важны только auth.signInWithOtp
 * и auth.verifyOtp, а не доступ к данным.
 */
export function createSupabaseAuthClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
