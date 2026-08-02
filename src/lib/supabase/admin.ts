import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Административный клиент с service-role ключом.
 * ТОЛЬКО для серверного кода (route handlers, server actions, вебхуки).
 * Никогда не импортировать в client components — обходит Row Level Security.
 */
export function createSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
