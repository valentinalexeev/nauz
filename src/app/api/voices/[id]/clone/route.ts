import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { finishVoiceClone } from "@/lib/voices/clone-sample";

/**
 * Завершает клонирование: забирает образцы, ранее загруженные по одному
 * через POST /api/voices/[id]/clone/sample, и отправляет их в ElevenLabs.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: voiceId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await finishVoiceClone({ userId: user.id, voiceId });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "cloning failed" },
      { status: err instanceof Error && err.message === "voice not ready for cloning" ? 400 : 500 },
    );
  }
}
