import Link from "next/link";
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
    : { data: [] as { id: string; chapter_id: string; voice_id: string; audio_url: string | null }[] };

  // Последняя (самая свежая) готовая генерация на пару глава+голос.
  const audioUrlByKey: Record<string, string> = {};
  for (const g of generations ?? []) {
    const key = `${g.chapter_id}:${g.voice_id}`;
    if (audioUrlByKey[key] || !g.audio_url) continue;
    const { data } = await supabase.storage
      .from("audio-generations")
      .createSignedUrl(g.audio_url, 60 * 60);
    if (data?.signedUrl) audioUrlByKey[key] = data.signedUrl;
  }

  return (
    <main className="flex-1 max-w-2xl w-full mx-auto px-6 py-16 flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">{(book as Book).title}</h1>
        <Link href="/books" className="text-sm text-neutral-500 underline">
          ← ко всем книгам
        </Link>
      </div>

      <BookReader
        bookId={id}
        chapters={(chapters as RawBookChapter[]) ?? []}
        voices={(voices as Voice[]) ?? []}
        audioUrlByKey={audioUrlByKey}
      />
    </main>
  );
}
