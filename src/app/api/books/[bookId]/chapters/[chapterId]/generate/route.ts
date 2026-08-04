import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateChapterAudio } from "@/lib/books/generate-chapter-audio";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookId: string; chapterId: string }> },
) {
  const { chapterId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { voiceId, speed, includeRecap, recapDelaySeconds } = (await request.json()) as {
    voiceId: string;
    speed?: number;
    includeRecap?: boolean;
    recapDelaySeconds?: number;
  };

  try {
    const result = await generateChapterAudio({
      userId: user.id,
      voiceId,
      chapterId,
      speed,
      includeRecap,
      recapDelaySeconds,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "generation failed";
    const status = [
      "voice not ready",
      "chapter not found",
      "invalid speed",
      "invalid recap delay",
    ].includes(message)
      ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
