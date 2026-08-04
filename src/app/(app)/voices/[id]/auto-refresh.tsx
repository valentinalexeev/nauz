"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Периодически перезапрашивает Server Component-страницу (router.refresh()),
 * пока статус ожидает внешнего события (KYC-вебхук, клонирование) — без
 * этого пользователю пришлось бы вручную обновлять страницу, чтобы увидеть
 * смену статуса.
 */
export function AutoRefresh({ intervalMs = 8000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
