"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

type AppShellSection = "voices" | "stories" | "books" | null;

const TABS: { section: Exclude<AppShellSection, null>; label: string }[] = [
  { section: "voices", label: "Голоса" },
  { section: "stories", label: "Тексты" },
  { section: "books", label: "Книги" },
];

function useActiveSection(): AppShellSection {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (pathname.startsWith("/voices")) return "voices";
  if (pathname.startsWith("/stories")) return "stories";
  if (pathname.startsWith("/books")) return "books";
  if (pathname.startsWith("/dashboard")) {
    const tab = searchParams.get("tab");
    if (tab === "stories" || tab === "books") return tab;
    return "voices";
  }
  return null;
}

/**
 * Общий каркас кабинета — сайдбар с разделами (Голоса/Тексты/Книги),
 * подключается ОДИН раз в src/app/(app)/layout.tsx и остаётся смонтированным
 * между переходами внутри кабинета (Next.js переиспользует layout, меняет
 * только содержимое <main>) — раньше каждая страница рендерила свой
 * собственный AppShell, из-за чего сайдбар пересоздавался при каждом
 * переходе (мигал/пропадал на время загрузки новой страницы).
 *
 * Активная вкладка определяется на клиенте по текущему пути
 * (usePathname/useSearchParams), а не передаётся пропом — иначе каждая
 * авторизованная страница должна была бы сама знать, в каком она разделе.
 */
export function AppShell({
  userEmail,
  children,
}: {
  userEmail: string | null;
  children: React.ReactNode;
}) {
  const active = useActiveSection();

  return (
    <div className="flex min-h-screen w-full">
      <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col overflow-y-auto border-r border-border bg-paper px-5 py-8">
        <Link
          href="/dashboard"
          className="mb-9 px-2 font-serif text-xl font-semibold text-ink no-underline"
        >
          Науз
        </Link>
        <nav className="flex flex-col gap-0.5">
          {TABS.map((tab) => (
            <Link
              key={tab.section}
              href={`/dashboard?tab=${tab.section}`}
              className={cn(
                "rounded-lg px-3 py-2.5 text-sm font-semibold no-underline transition-colors",
                active === tab.section
                  ? "bg-clay text-white"
                  : "text-ink-soft hover:bg-surface hover:text-ink",
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        {userEmail && (
          <div className="mt-auto flex items-center gap-2.5 border-t border-border pt-4">
            <div className="h-7 w-7 shrink-0 rounded-full bg-border" />
            <span className="truncate text-sm font-semibold text-ink">
              {userEmail}
            </span>
          </div>
        )}
      </aside>
      <main className="min-w-0 flex-1 px-10 py-12 md:px-14">
        <div className="mx-auto flex max-w-3xl flex-col gap-8">{children}</div>
      </main>
    </div>
  );
}
