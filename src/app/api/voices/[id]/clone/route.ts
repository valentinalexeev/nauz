import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cloneVoiceSample } from "@/lib/voices/clone-sample";

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

  // Несколько образцов (по одному на каждый прочитанный текст) — см.
  // voice-recorder.tsx, все под одним ключом "audio" в FormData.
  const formData = await request.formData();
  const audio = formData
    .getAll("audio")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (!audio.length) {
    return NextResponse.json({ error: "audio sample required" }, { status: 400 });
  }

  try {
    const result = await cloneVoiceSample({ userId: user.id, voiceId, audio });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "cloning failed" },
      { status: err instanceof Error && err.message === "voice not ready for cloning" ? 400 : 500 },
    );
  }
}
