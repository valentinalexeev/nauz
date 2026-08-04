import Link from "next/link";
import { cn } from "@/lib/utils";

export type AppShellSection = "voices" | "stories" | "books";

const TABS: { section: AppShellSection; label: string }[] = [
  { section: "voices", label: "Голоса" },
  { section: "stories", label: "Тексты" },
  { section: "books", label: "Книги" },
];

/**
 * Общий каркас кабинета — сайдбар с разделами (Голоса/Тексты/Книги) вместо
 * повторяющегося "← назад в дашборд" на каждой странице (см. "экран 3" в
 * docs/Науз - дизайн.dc.html). Данные и запросы страниц не меняются —
 * это только разметка вокруг них; каждая авторизованная страница передаёт
 * свой раздел в `active`, чтобы соответствующая вкладка подсвечивалась,
 * даже когда пользователь на детальной странице (/voices/[id] и т.п.), а
 * не на самом /dashboard.
 */
export function AppShell({
  active,
  userEmail,
  children,
}: {
  active: AppShellSection | null;
  userEmail: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-paper px-5 py-8">
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
