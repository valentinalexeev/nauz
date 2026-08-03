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

  const formData = await request.formData();
  const audio = formData.get("audio");

  if (!(audio instanceof Blob) || audio.size === 0) {
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
