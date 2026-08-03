import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Voice, Story } from "@/lib/types";
import { DeleteButton } from "./delete-button";

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

  // Голос сказки узнаём через её последнюю генерацию — у stories нет
  // собственного voice_id, связь идёт через audio_generations.
  const storyIds = (stories ?? []).map((s) => s.id);
  const { data: generations } = storyIds.length
    ? await supabase
        .from("audio_generations")
        .select("story_id, voice_id, created_at")
        .in("story_id", storyIds)
        .order("created_at", { ascending: false })
    : { data: [] as { story_id: string; voice_id: string; created_at: string }[] };

  const voiceIdByStoryId = new Map<string, string>();
  for (const g of generations ?? []) {
    if (!voiceIdByStoryId.has(g.story_id)) voiceIdByStoryId.set(g.story_id, g.voice_id);
  }
  const voiceLabelById = new Map((voices as Voice[] | null ?? []).map((v) => [v.id, v.label]));

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
                <div className="flex items-center gap-3">
                  <span className="text-xs text-neutral-500">
                    {statusLabel(voice.status)}
                  </span>
                  <DeleteButton
                    endpoint={`/api/voices/${voice.id}`}
                    confirmMessage={`Удалить голос «${voice.label}»? Это действие необратимо.`}
                  />
                </div>
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
                className="rounded-lg border border-neutral-200 px-4 py-3 flex items-center justify-between"
              >
                <div className="flex flex-col">
                  <Link href={`/stories/${story.id}`} className="underline">
                    {story.title}
                  </Link>
                  <span className="text-xs text-neutral-500">
                    голос: {voiceLabelById.get(voiceIdByStoryId.get(story.id) ?? "") ?? "неизвестен"}
                  </span>
                </div>
                <DeleteButton
                  endpoint={`/api/stories/${story.id}`}
                  confirmMessage={`Удалить запись «${story.title}»? Это действие необратимо.`}
                />
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
