import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Отдаёт (создавая при необходимости) публичную ссылку на книгу для
 * ТЕКУЩЕГО пользователя — одна ссылка на пару (книга, владелец), а не на
 * конкретный голос: разные главы могут быть озвучены разными голосами
 * ОДНОГО владельца (см. миграцию 0020), ссылка показывает все главы,
 * какими бы своими голосами он их ни озвучил.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const { bookId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: existing } = await supabase
    .from("book_share_links")
    .select("share_token")
    .eq("book_id", bookId)
    .eq("owner_id", user.id)
    .single();

  if (existing) {
    return NextResponse.json({ shareToken: existing.share_token });
  }

  const { data: created, error } = await supabase
    .from("book_share_links")
    .insert({ book_id: bookId, owner_id: user.id })
    .select("share_token")
    .single();

  if (error || !created) {
    return NextResponse.json(
      { error: error?.message ?? "failed to create share link" },
      { status: 500 },
    );
  }

  return NextResponse.json({ shareToken: created.share_token });
}
