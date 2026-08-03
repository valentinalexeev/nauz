import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Перевыпускает share_token сказки — старая публичная ссылка перестаёт
 * работать. RLS-политика "stories: owner can update" уже разрешает это
 * владельцу, admin-клиент не нужен.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: storyId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const shareToken = randomBytes(16).toString("hex");
  const { data: story, error } = await supabase
    .from("stories")
    .update({ share_token: shareToken })
    .eq("id", storyId)
    .eq("owner_id", user.id)
    .select("share_token")
    .single();

  if (error || !story) {
    return NextResponse.json(
      { error: error?.message ?? "not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ shareToken: story.share_token });
}
