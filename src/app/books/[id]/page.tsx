import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Book, Voice } from "@/lib/types";
import { AppShell } from "@/components/layout/app-shell";
import { BookReader, type RawBookChapter } from "./book-reader";

export default async function BookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
  const generationByKey: Record<
    string,
    { audioUrl: string; recapAudioUrl: string | null; recapDelaySeconds: number }
  > = {};
  for (const g of generations ?? []) {
    const key = `${g.chapter_id}:${g.voice_id}`;
    if (generationByKey[key] || !g.audio_url) continue;

    const { data: audioSigned } = await supabase.storage
      .from("audio-generations")
      .createSignedUrl(g.audio_url, 60 * 60);
    if (!audioSigned?.signedUrl) continue;

    let recapAudioUrl: string | null = null;
    if (g.recap_audio_url) {
      const { data: recapSigned } = await supabase.storage
        .from("audio-generations")
        .createSignedUrl(g.recap_audio_url, 60 * 60);
      recapAudioUrl = recapSigned?.signedUrl ?? null;
    }

    generationByKey[key] = {
      audioUrl: audioSigned.signedUrl,
      recapAudioUrl,
      recapDelaySeconds: g.recap_delay_seconds,
    };
  }

  return (
    <AppShell active="books" userEmail={user?.email ?? null}>
      <h1 className="font-serif text-3xl font-medium text-ink">{(book as Book).title}</h1>

      <BookReader
        bookId={id}
        chapters={(chapters as RawBookChapter[]) ?? []}
        voices={(voices as Voice[]) ?? []}
        generationByKey={generationByKey}
        siteUrl={process.env.NEXT_PUBLIC_SITE_URL ?? ""}
      />
    </AppShell>
  );
}
