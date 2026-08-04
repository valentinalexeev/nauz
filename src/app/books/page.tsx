import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Book } from "@/lib/types";
import { AppShell } from "@/components/layout/app-shell";

export default async function BooksPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: books } = await supabase
    .from("books")
    .select("*")
    .order("title", { ascending: true });

  return (
    <AppShell active="books" userEmail={user?.email ?? null}>
      <h1 className="font-serif text-3xl font-medium text-ink">Книги по главам</h1>

      {!books?.length ? (
        <p className="rounded-2xl border border-dashed border-border px-5 py-8 text-center text-sm text-ink-soft">
          Пока нет ни одной книги.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {(books as Book[]).map((book) => (
            <li key={book.id} className="rounded-2xl border border-border px-5 py-4">
              <Link
                href={`/books/${book.id}`}
                className="font-semibold text-ink no-underline hover:underline"
              >
                {book.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
