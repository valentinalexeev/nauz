"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase-клиент для использования в браузере (client components).
 * Использует публичные (anon) ключи — безопасно для клиента.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
