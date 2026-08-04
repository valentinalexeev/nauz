import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Voice, Story } from "@/lib/types";
import { DeleteButton } from "./delete-button";
import { RenameVoiceButton } from "@/components/voice/rename-voice-button";

type DashboardTab = "voices" | "stories" | "books";

const TAB_TITLE: Record<DashboardTab, string> = {
  voices: "Голоса",
  stories: "Тексты",
  books: "Книги",
};

const TAB_SUBTITLE: Record<DashboardTab, string> = {
  voices: "Голоса, которыми Науз читает вашим детям",
  stories: "Ваши письма и сказки",
  books: "Книги, доступные для озвучки",
};

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
      return "голос удалён";
  }
}

function statusPillClass(status: Voice["status"]) {
  switch (status) {
    case "ready":
      return "bg-sage text-white";
    case "failed":
      return "bg-destructive text-white";
    case "revoked":
      return "bg-border text-ink-soft";
    default:
      return "bg-clay text-white";
  }
}

function statusSubtitle(status: Voice["status"]) {
  switch (status) {
    case "awaiting_kyc":
      return "Ждём подтверждения личности";
    case "kyc_approved":
      return "Готов к записи образца голоса";
    case "cloning":
      return "Клонирование займёт пару минут";
    case "ready":
      return "Готов к использованию";
    case "failed":
      return "Не удалось создать голос из образца";
    case "revoked":
      return "Прежние записи остаются доступны";
  }
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: rawTab } = await searchParams;
  const tab: DashboardTab =
    rawTab === "stories" || rawTab === "books" ? rawTab : "voices";

  const supabase = await createSupabaseServerClient();

  // Раньше здесь параллельно грузились голоса+тексты+книги+главы+генерации
  // разом, независимо от того, какая вкладка сейчас открыта — переключение
  // вкладки означало полный набор запросов на каждый клик. Теперь грузим
  // только то, что нужно активной вкладке.
  return (
    <>
      <TabHeader tab={tab} />
      {tab === "voices" && <VoicesTab supabase={supabase} />}
      {tab === "stories" && <StoriesTab supabase={supabase} />}
      {tab === "books" && <BooksTab supabase={supabase} />}
    </>
  );
}

function TabHeader({ tab }: { tab: DashboardTab }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="font-serif text-3xl font-medium text-ink">{TAB_TITLE[tab]}</h1>
        <p className="mt-1 text-sm text-ink-soft">{TAB_SUBTITLE[tab]}</p>
      </div>
      {tab === "voices" && (
        <Link
          href="/voices/new"
          className="whitespace-nowrap rounded-lg bg-clay px-4 py-2.5 text-sm font-semibold text-white no-underline transition-colors hover:bg-clay-hover"
        >
          + Записать голос
        </Link>
      )}
      {tab === "stories" && (
        <Link
          href="/stories/new"
          className="whitespace-nowrap rounded-lg bg-clay px-4 py-2.5 text-sm font-semibold text-white no-underline transition-colors hover:bg-clay-hover"
        >
          + Новая запись
        </Link>
      )}
    </div>
  );
}

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function VoicesTab({ supabase }: { supabase: Supabase }) {
  const { data: voices } = await supabase
    .from("voices")
    .select("*")
    .order("created_at", { ascending: false });

  if (!voices?.length) {
    return (
      <EmptyState>
        Пока нет ни одного голоса. Добавьте первый — свой или, с их
        согласия, близкого родственника.
      </EmptyState>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {(voices as Voice[]).map((voice) => (
        <div
          key={voice.id}
          className="flex flex-col gap-3 rounded-2xl border border-border p-5"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-clay font-semibold text-white">
              {voice.label.slice(0, 1).toUpperCase()}
            </div>
            <Link
              href={`/voices/${voice.id}`}
              className="font-semibold text-ink no-underline hover:underline"
            >
              {voice.label}
            </Link>
          </div>
          <span
            className={`w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusPillClass(voice.status)}`}
          >
            {statusLabel(voice.status)}
          </span>
          <p className="text-xs text-ink-soft">{statusSubtitle(voice.status)}</p>
          {voice.status !== "revoked" && (
            <div className="mt-auto flex items-center gap-3 pt-1">
              <RenameVoiceButton voiceId={voice.id} currentLabel={voice.label} />
              <DeleteButton
                endpoint={`/api/voices/${voice.id}`}
                confirmMessage={`Удалить голос «${voice.label}»? Это действие необратимо.`}
              />
            </div>
          )}
        </div>
      ))}
      <Link
        href="/voices/new"
        className="flex min-h-[132px] items-center justify-center rounded-2xl border border-dashed border-border text-sm font-semibold text-ink-soft no-underline transition-colors hover:border-clay hover:text-clay"
      >
        + Записать новый голос
      </Link>
    </div>
  );
}

async function StoriesTab({ supabase }: { supabase: Supabase }) {
  const { data: stories } = await supabase
    .from("stories")
    .select("*")
    .order("created_at", { ascending: false });

  if (!stories?.length) {
    return (
      <div className="flex flex-col gap-3">
        <EmptyState>Записей пока нет.</EmptyState>
        <Link
          href="/stories/new"
          className="rounded-2xl border border-dashed border-border py-4 text-center text-sm font-semibold text-ink-soft no-underline transition-colors hover:border-clay hover:text-clay"
        >
          + Новое письмо или сказка
        </Link>
      </div>
    );
  }

  const storyIds = stories.map((s) => s.id);
  const [{ data: generations }, { data: voices }] = await Promise.all([
    supabase
      .from("audio_generations")
      .select("story_id, voice_id, status")
      .in("story_id", storyIds),
    supabase.from("voices").select("id, label, status"),
  ]);

  // Голоса сказки узнаём через её генерации — у stories нет собственного
  // voice_id, связь идёт через audio_generations. Одна запись может быть
  // озвучена несколькими голосами (см. StoryReader) — собираем их все, а
  // не только самый свежий.
  const voiceIdsByStoryId = new Map<string, string[]>();
  const readyStoryIds = new Set<string>();
  for (const g of generations ?? []) {
    const list = voiceIdsByStoryId.get(g.story_id) ?? [];
    if (!list.includes(g.voice_id)) list.push(g.voice_id);
    voiceIdsByStoryId.set(g.story_id, list);
    if (g.status === "ready") readyStoryIds.add(g.story_id);
  }
  const voiceById = new Map(
    (voices as Pick<Voice, "id" | "label" | "status">[] | null ?? []).map((v) => [v.id, v]),
  );

  return (
    <div className="flex flex-col gap-3">
      {(stories as Story[]).map((story) => {
        const storyVoices = (voiceIdsByStoryId.get(story.id) ?? [])
          .map((voiceId) => voiceById.get(voiceId))
          .filter((v): v is Pick<Voice, "id" | "label" | "status"> => !!v);
        const voiceLabel = storyVoices.length
          ? storyVoices
              .map((v) => v.label + (v.status === "revoked" ? " (удалён)" : ""))
              .join(", ")
          : "не озвучена";
        const isReady = readyStoryIds.has(story.id);
        return (
          <div
            key={story.id}
            className="flex items-center justify-between gap-4 rounded-2xl border border-border px-5 py-4"
          >
            <div className="flex min-w-0 items-center gap-3.5">
              <div
                className={`h-9 w-9 shrink-0 rounded-full ${isReady ? "bg-clay" : "bg-border"}`}
              />
              <div className="min-w-0">
                <Link
                  href={`/stories/${story.id}`}
                  className="font-semibold text-ink no-underline hover:underline"
                >
                  {story.title}
                </Link>
                <p className="mt-0.5 truncate text-xs text-ink-soft">Голосом «{voiceLabel}»</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span
                className={
                  isReady
                    ? "rounded-full bg-sage px-2.5 py-1 text-[11px] font-semibold text-white"
                    : "rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-ink-soft"
                }
              >
                {isReady ? "готово" : "не озвучено"}
              </span>
              <DeleteButton
                endpoint={`/api/stories/${story.id}`}
                confirmMessage={`Удалить запись «${story.title}»? Это действие необратимо.`}
              />
            </div>
          </div>
        );
      })}
      <Link
        href="/stories/new"
        className="rounded-2xl border border-dashed border-border py-4 text-center text-sm font-semibold text-ink-soft no-underline transition-colors hover:border-clay hover:text-clay"
      >
        + Новое письмо или сказка
      </Link>
    </div>
  );
}

async function BooksTab({ supabase }: { supabase: Supabase }) {
  const { data: books } = await supabase
    .from("books")
    .select("*")
    .order("title", { ascending: true });

  if (!books?.length) {
    return <EmptyState>Пока нет ни одной книги.</EmptyState>;
  }

  const bookIds = books.map((b) => b.id);
  const { data: chapters } = await supabase
    .from("book_chapters")
    .select("id, book_id")
    .in("book_id", bookIds);

  const chaptersByBookId = new Map<string, string[]>();
  for (const c of chapters ?? []) {
    const list = chaptersByBookId.get(c.book_id) ?? [];
    list.push(c.id);
    chaptersByBookId.set(c.book_id, list);
  }

  const chapterIds = (chapters ?? []).map((c) => c.id);
  const { data: chapterGenerations } = chapterIds.length
    ? await supabase
        .from("book_chapter_generations")
        .select("chapter_id")
        .in("chapter_id", chapterIds)
        .eq("status", "ready")
    : { data: [] as { chapter_id: string }[] };
  const voicedChapterIds = new Set((chapterGenerations ?? []).map((g) => g.chapter_id));

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {books.map((book) => {
        const bookChapterIds = chaptersByBookId.get(book.id) ?? [];
        const voicedCount = bookChapterIds.filter((id) => voicedChapterIds.has(id)).length;
        const total = bookChapterIds.length;
        const progress = total ? Math.round((voicedCount / total) * 100) : 0;
        return (
          <Link
            key={book.id}
            href={`/books/${book.id}`}
            className="flex flex-col gap-3.5 rounded-2xl border border-border p-5 no-underline transition-colors hover:border-clay"
          >
            <div
              className="h-24 w-full rounded-xl"
              style={{
                background:
                  "repeating-linear-gradient(45deg, var(--surface), var(--surface) 8px, oklch(0.90 0.016 55) 8px, oklch(0.90 0.016 55) 16px)",
              }}
            />
            <div>
              <p className="font-semibold text-ink">{book.title}</p>
              <p className="mt-1 text-xs text-ink-soft">
                {voicedCount} из {total} {total === 1 ? "главы" : "глав"} озвучено
              </p>
            </div>
            <div className="h-1 w-full rounded-full bg-border">
              <div className="h-1 rounded-full bg-clay" style={{ width: `${progress}%` }} />
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-border px-5 py-8 text-center text-sm text-ink-soft">
      {children}
    </p>
  );
}
