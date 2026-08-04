import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Отдаёт (создавая при необходимости) публичную ссылку на пару книга+голос
 * — ссылка привязана к КОНКРЕТНОМУ голосу, а не к книге целиком: книгу
 * могут читать голоса разных пользователей, и общая на всех ссылка могла
 * бы показать чужую запись вместо своей (см. миграцию 0019).
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

  const { voiceId } = (await request.json()) as { voiceId: string };

  const { data: voice } = await supabase
    .from("voices")
    .select("id")
    .eq("id", voiceId)
    .eq("owner_id", user.id)
    .single();

  if (!voice) {
    return NextResponse.json({ error: "voice not found" }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from("book_share_links")
    .select("share_token")
    .eq("book_id", bookId)
    .eq("voice_id", voiceId)
    .eq("owner_id", user.id)
    .single();

  if (existing) {
    return NextResponse.json({ shareToken: existing.share_token });
  }

  const { data: created, error } = await supabase
    .from("book_share_links")
    .insert({ book_id: bookId, voice_id: voiceId, owner_id: user.id })
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
