import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ChapterPlayer } from "@/app/(app)/books/[id]/chapter-player";

async function resolveLink(token: string) {
  const admin = createSupabaseAdminClient();
  const { data: link } = await admin
    .from("book_share_links")
    .select("book_id, owner_id")
    .eq("share_token", token)
    .single();
  return link;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const link = await resolveLink(token);
  if (!link) return { title: "Науз" };

  const admin = createSupabaseAdminClient();
  const { data: book } = await admin
    .from("books")
    .select("title")
    .eq("id", link.book_id)
    .single();

  return { title: book ? `Науз — ${book.title}` : "Науз" };
}

/**
 * Публичная страница книги для конкретного ВЛАДЕЛЬЦА — без авторизации,
 * по аналогии с /s/[token] для отдельных сказок. Ссылка привязана к паре
 * (книга, владелец) — см. миграцию 0020 и /api/books/[bookId]/share —
 * поэтому показывает записи ЛЮБЫХ голосов этого владельца (разные главы
 * могли озвучить разные его голоса), но никогда — чужие.
 *
 * Тёмный экран слушателя (см. "экран 6" в docs/Науз - дизайн.dc.html),
 * ChapterPlayer в dark-варианте сохраняет ту же логику recap → пауза →
 * глава, что и в приватном кабинете — меняется только оформление.
 */
export default async function SharedBookPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const link = await resolveLink(token);
  if (!link) notFound();

  const admin = createSupabaseAdminClient();

  const { data: book } = await admin
    .from("books")
    .select("*")
    .eq("id", link.book_id)
    .single();

  if (!book) notFound();

  const { data: chapters } = await admin
    .from("book_chapters")
    .select("id, order_index, title, text_plain")
    .eq("book_id", book.id)
    .order("order_index", { ascending: true });

  const { data: voices } = await admin
    .from("voices")
    .select("id, label")
    .eq("owner_id", link.owner_id);
  const voiceLabelById = new Map((voices ?? []).map((v) => [v.id, v.label]));

  const chapterIds = (chapters ?? []).map((c) => c.id);
  const { data: generations } = chapterIds.length
    ? await admin
        .from("book_chapter_generations")
        .select("chapter_id, voice_id, audio_url, recap_audio_url, recap_delay_seconds")
        .in("chapter_id", chapterIds)
        .eq("owner_id", link.owner_id)
        .eq("status", "ready")
        .order("created_at", { ascending: false })
    : {
        data: [] as {
          chapter_id: string;
          voice_id: string;
          audio_url: string | null;
          recap_audio_url: string | null;
          recap_delay_seconds: number;
        }[],
      };

  // Несколько голосов могут озвучить одну и ту же главу — держим все
  // готовые версии (последнюю на каждый голос), а не только одну.
  const latestReady = new Map<
    string,
    { chapterId: string; voiceId: string; audioPath: string; recapPath: string | null; recapDelaySeconds: number }
  >();
  for (const g of generations ?? []) {
    const key = `${g.chapter_id}:${g.voice_id}`;
    if (latestReady.has(key) || !g.audio_url) continue;
    latestReady.set(key, {
      chapterId: g.chapter_id,
      voiceId: g.voice_id,
      audioPath: g.audio_url,
      recapPath: g.recap_audio_url,
      recapDelaySeconds: g.recap_delay_seconds,
    });
  }

  // Один batch-запрос на все подписанные ссылки (главы + recap) вместо до
  // двух последовательных createSignedUrl() на каждую готовую генерацию.
  const allPaths = [
    ...new Set(
      [...latestReady.values()].flatMap((v) => [v.audioPath, v.recapPath].filter((p): p is string => !!p)),
    ),
  ];
  const { data: signedUrls } = allPaths.length
    ? await admin.storage.from("audio-generations").createSignedUrls(allPaths, 60 * 60)
    : { data: [] as { path: string; signedUrl: string }[] };
  const signedUrlByPath = new Map((signedUrls ?? []).map((s) => [s.path, s.signedUrl]));

  const generationsByChapterId = new Map<
    string,
    { voiceLabel: string; audioUrl: string; recapAudioUrl: string | null; recapDelaySeconds: number }[]
  >();
  for (const v of latestReady.values()) {
    const audioUrl = signedUrlByPath.get(v.audioPath);
    if (!audioUrl) continue;

    const list = generationsByChapterId.get(v.chapterId) ?? [];
    list.push({
      voiceLabel: voiceLabelById.get(v.voiceId) ?? "неизвестный голос",
      audioUrl,
      recapAudioUrl: v.recapPath ? (signedUrlByPath.get(v.recapPath) ?? null) : null,
      recapDelaySeconds: v.recapDelaySeconds,
    });
    generationsByChapterId.set(v.chapterId, list);
  }

  return (
    <main className="flex flex-1 flex-col items-center bg-[oklch(0.22_0.02_40)] px-6 py-16">
      <div className="flex w-full max-w-md flex-col gap-6">
        <h1 className="text-center font-serif text-2xl font-medium text-[oklch(0.93_0.02_60)]">
          {book.title}
        </h1>

        <ul className="flex flex-col gap-5">
          {(chapters ?? []).map((chapter) => {
            const chapterGenerations = generationsByChapterId.get(chapter.id) ?? [];
            return (
              <li
                key={chapter.id}
                className="flex flex-col gap-3 rounded-[24px] bg-[oklch(0.24_0.02_40)] px-6 py-6"
              >
                <div className="text-center">
                  <div className="text-[12px] font-semibold tracking-wide text-[oklch(0.75_0.05_45)] uppercase">
                    Глава {chapter.order_index}
                  </div>
                  <h2 className="mt-1 font-serif text-xl font-medium text-[oklch(0.93_0.02_60)]">
                    {chapter.title}
                  </h2>
                </div>
                {chapterGenerations.length ? (
                  chapterGenerations.map((generation, i) => (
                    <div key={i} className="flex flex-col gap-1.5">
                      <span className="text-center text-xs text-[oklch(0.65_0.02_55)]">
                        читает {generation.voiceLabel}
                      </span>
                      <ChapterPlayer
                        dark
                        recapAudioUrl={generation.recapAudioUrl}
                        chapterAudioUrl={generation.audioUrl}
                        recapDelaySeconds={generation.recapDelaySeconds}
                      />
                    </div>
                  ))
                ) : (
                  <p className="text-center text-sm text-[oklch(0.65_0.02_55)]">
                    Эта глава пока не озвучена.
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        <div className="pt-2 text-center text-[11px] tracking-wide text-[oklch(0.5_0.02_55)]">
          НАУЗ
        </div>
      </div>
    </main>
  );
}
