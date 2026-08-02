import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Voice, Story } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: voices }, { data: stories }] = await Promise.all([
    supabase
      .from("voices")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("stories")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <main className="flex-1 max-w-3xl w-full mx-auto px-6 py-16 flex flex-col gap-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Науз</h1>
          <p className="text-sm text-neutral-500">{user?.email}</p>
        </div>
      </header>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Голоса</h2>
          <Link
            href="/voices/new"
            className="text-sm font-medium text-neutral-900 underline"
          >
            + добавить голос
          </Link>
        </div>
        {!voices?.length ? (
          <p className="text-sm text-neutral-500">
            Пока нет ни одного голоса. Добавьте первый — свой или, с их
            согласия, близкого родственника.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {(voices as Voice[]).map((voice) => (
              <li
                key={voice.id}
                className="rounded-lg border border-neutral-200 px-4 py-3 flex items-center justify-between"
              >
                <Link href={`/voices/${voice.id}`} className="underline">
                  {voice.label}
                </Link>
                <span className="text-xs text-neutral-500">
                  {statusLabel(voice.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Сказки и письма</h2>
          <Link
            href="/stories/new"
            className="text-sm font-medium text-neutral-900 underline"
          >
            + новая запись
          </Link>
        </div>
        {!stories?.length ? (
          <p className="text-sm text-neutral-500">Записей пока нет.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {(stories as Story[]).map((story) => (
              <li
                key={story.id}
                className="rounded-lg border border-neutral-200 px-4 py-3"
              >
                {story.title}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function statusLabel(status: Voice["status"]) {
  switch (status) {
    case "awaiting_kyc":
      return "ожидает подтверждения личности";
    case "kyc_approved":
      return "подтверждён, готовим слепок";
    case "cloning":
      return "создаём голос...";
    case "ready":
      return "готов";
    case "failed":
      return "ошибка";
    case "revoked":
      return "доступ отозван";
  }
}
