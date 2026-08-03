import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Book } from "@/lib/types";

export default async function BooksPage() {
  const supabase = await createSupabaseServerClient();
  const { data: books } = await supabase
    .from("books")
    .select("*")
    .order("title", { ascending: true });

  return (
    <main className="flex-1 max-w-2xl w-full mx-auto px-6 py-16 flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Книги по главам</h1>
        <Link href="/dashboard" className="text-sm text-neutral-500 underline">
          ← назад в дашборд
        </Link>
      </div>

      {!books?.length ? (
        <p className="text-sm text-neutral-500">Пока нет ни одной книги.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {(books as Book[]).map((book) => (
            <li
              key={book.id}
              className="rounded-lg border border-neutral-200 px-4 py-3"
            >
              <Link href={`/books/${book.id}`} className="underline">
                {book.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
