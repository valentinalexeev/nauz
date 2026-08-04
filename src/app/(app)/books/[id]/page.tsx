import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Book, Voice } from "@/lib/types";
import { BookReader, type RawBookChapter } from "./book-reader";

export default async function BookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: book } = await supabase
    .from("books")
    .select("*")
    .eq("id", id)
    .single();

  if (!book) notFound();

  const { data: chapters } = await supabase
    .from("book_chapters")
    .select("*")
    .eq("book_id", id)
    .order("order_index", { ascending: true });

  const { data: voices } = await supabase
    .from("voices")
    .select("*")
    .eq("status", "ready");

  const chapterIds = (chapters ?? []).map((c) => c.id);
  const { data: generations } = chapterIds.length
    ? await supabase
        .from("book_chapter_generations")
        .select("*")
        .in("chapter_id", chapterIds)
        .eq("status", "ready")
        .order("created_at", { ascending: false })
    : {
        data: [] as {
          id: string;
          chapter_id: string;
          voice_id: string;
          audio_url: string | null;
          recap_audio_url: string | null;
          recap_delay_seconds: number;
        }[],
      };

  // Последняя (самая свежая) готовая генерация на пару глава+голос.
  const latestReady = new Map<
    string,
    { audioPath: string; recapPath: string | null; recapDelaySeconds: number }
  >();
  for (const g of generations ?? []) {
    const key = `${g.chapter_id}:${g.voice_id}`;
    if (latestReady.has(key) || !g.audio_url) continue;
    latestReady.set(key, {
      audioPath: g.audio_url,
      recapPath: g.recap_audio_url,
      recapDelaySeconds: g.recap_delay_seconds,
    });
  }

  // Один batch-запрос на все подписанные ссылки (главы + recap) вместо до
  // двух последовательных createSignedUrl() на каждую готовую генерацию —
  // при нескольких главах/голосах это раньше означало десяток round-trip'ов
  // подряд и заметно тормозило открытие книги.
  const allPaths = [
    ...new Set(
      [...latestReady.values()].flatMap((v) => [v.audioPath, v.recapPath].filter((p): p is string => !!p)),
    ),
  ];
  const { data: signedUrls } = allPaths.length
    ? await supabase.storage.from("audio-generations").createSignedUrls(allPaths, 60 * 60)
    : { data: [] as { path: string; signedUrl: string }[] };
  const signedUrlByPath = new Map((signedUrls ?? []).map((s) => [s.path, s.signedUrl]));

  const generationByKey: Record<
    string,
    { audioUrl: string; recapAudioUrl: string | null; recapDelaySeconds: number }
  > = {};
  for (const [key, v] of latestReady) {
    const audioUrl = signedUrlByPath.get(v.audioPath);
    if (!audioUrl) continue;
    generationByKey[key] = {
      audioUrl,
      recapAudioUrl: v.recapPath ? (signedUrlByPath.get(v.recapPath) ?? null) : null,
      recapDelaySeconds: v.recapDelaySeconds,
    };
  }

  return (
    <>
      <h1 className="font-serif text-3xl font-medium text-ink">{(book as Book).title}</h1>

      <BookReader
        bookId={id}
        chapters={(chapters as RawBookChapter[]) ?? []}
        voices={(voices as Voice[]) ?? []}
        generationByKey={generationByKey}
        siteUrl={process.env.NEXT_PUBLIC_SITE_URL ?? ""}
      />
    </>
  );
}
