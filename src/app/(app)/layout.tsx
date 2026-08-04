import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";

/**
 * Общий layout для всего авторизованного кабинета (/dashboard, /voices,
 * /stories, /books — сгруппированы в (app), группа не влияет на URL).
 * AppShell рендерится здесь один раз и остаётся смонтированным между
 * переходами между этими разделами — раньше каждая страница оборачивала
 * себя в AppShell сама, из-за чего сайдбар (и имя пользователя в нём)
 * пересоздавался заново при каждом переходе, а не персистировал.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <AppShell userEmail={user?.email ?? null}>{children}</AppShell>;
}
