import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function DELETE(
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

  const { data: story } = await supabase
    .from("stories")
    .select("*")
    .eq("id", storyId)
    .eq("owner_id", user.id)
    .single();

  if (!story) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Чистим аудиофайлы в storage best-effort до удаления записи в БД —
  // после каскадного удаления audio_generations пути будут потеряны.
  const admin = createSupabaseAdminClient();
  const { data: generations } = await admin
    .from("audio_generations")
    .select("audio_url")
    .eq("story_id", story.id);
  const paths = (generations ?? [])
    .map((g) => g.audio_url)
    .filter((p): p is string => Boolean(p));
  if (paths.length) {
    await admin.storage.from("audio-generations").remove(paths);
  }

  // У stories уже есть RLS-политика delete для владельца — используем
  // user-scoped клиент, не расширяя полномочия без необходимости.
  const { error } = await supabase.from("stories").delete().eq("id", story.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
