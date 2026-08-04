import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addStoryVoice } from "@/lib/stories/generate-audio";

/**
 * Озвучивает уже существующую сказку/письмо ЕЩЁ ОДНИМ голосом — по аналогии
 * с /api/books/[bookId]/chapters/[chapterId]/generate. Не создаёт новую
 * запись story, добавляет новую строку audio_generations поверх той же.
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

  const { voiceId, speed } = (await request.json()) as {
    voiceId: string;
    speed?: number;
  };

  try {
    const result = await addStoryVoice({
      userId: user.id,
      storyId,
      voiceId,
      speed,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "generation failed";
    const status = [
      "voice not ready",
      "story not found",
      "story has no template",
      "template not found",
      "invalid speed",
    ].includes(message)
      ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
