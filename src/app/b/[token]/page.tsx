import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ChapterPlayer } from "@/app/books/[id]/chapter-player";

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
  const generationsByChapterId = new Map<
    string,
    { voiceLabel: string; audioUrl: string; recapAudioUrl: string | null; recapDelaySeconds: number }[]
  >();
  const seenChapterVoice = new Set<string>();
  for (const g of generations ?? []) {
    const key = `${g.chapter_id}:${g.voice_id}`;
    if (seenChapterVoice.has(key) || !g.audio_url) continue;
    seenChapterVoice.add(key);

    const { data: audioSigned } = await admin.storage
      .from("audio-generations")
      .createSignedUrl(g.audio_url, 60 * 60);
    if (!audioSigned?.signedUrl) continue;

    let recapAudioUrl: string | null = null;
    if (g.recap_audio_url) {
      const { data: recapSigned } = await admin.storage
        .from("audio-generations")
        .createSignedUrl(g.recap_audio_url, 60 * 60);
      recapAudioUrl = recapSigned?.signedUrl ?? null;
    }

    const list = generationsByChapterId.get(g.chapter_id) ?? [];
    list.push({
      voiceLabel: voiceLabelById.get(g.voice_id) ?? "неизвестный голос",
      audioUrl: audioSigned.signedUrl,
      recapAudioUrl,
      recapDelaySeconds: g.recap_delay_seconds,
    });
    generationsByChapterId.set(g.chapter_id, list);
  }

  return (
    <main className="flex-1 max-w-2xl w-full mx-auto px-6 py-16 flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">{book.title}</h1>

      <ul className="flex flex-col gap-4">
        {(chapters ?? []).map((chapter) => {
          const chapterGenerations = generationsByChapterId.get(chapter.id) ?? [];
          return (
            <li
              key={chapter.id}
              className="rounded-lg border border-neutral-200 px-4 py-4 flex flex-col gap-3"
            >
              <p className="text-sm font-medium text-neutral-900">
                Глава {chapter.order_index}. {chapter.title}
              </p>
              <p className="whitespace-pre-wrap text-sm text-neutral-600">
                {chapter.text_plain}
              </p>
              {chapterGenerations.length ? (
                chapterGenerations.map((generation, i) => (
                  <div key={i} className="flex flex-col gap-1">
                    <span className="text-xs text-neutral-500">
                      Голос: {generation.voiceLabel}
                    </span>
                    <ChapterPlayer
                      recapAudioUrl={generation.recapAudioUrl}
                      chapterAudioUrl={generation.audioUrl}
                      recapDelaySeconds={generation.recapDelaySeconds}
                    />
                  </div>
                ))
              ) : (
                <p className="text-sm text-neutral-400">Эта глава пока не озвучена.</p>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
