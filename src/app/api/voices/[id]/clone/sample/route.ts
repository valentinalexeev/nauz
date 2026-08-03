import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uploadVoiceSample } from "@/lib/voices/clone-sample";

/**
 * Загружает ОДИН образец голоса (см. voice-recorder.tsx — по одному на
 * каждый прочитанный текст). Намеренно отдельный запрос на файл: тело
 * запроса к Vercel-функциям ограничено ~4.5MB, несколько образцов разом
 * легко превышают лимит. Финализирует клонирование POST /api/voices/[id]/clone.
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

  const formData = await request.formData();
  const audio = formData.get("audio");
  const indexRaw = formData.get("index");
  const index = typeof indexRaw === "string" ? Number(indexRaw) : NaN;

  if (!(audio instanceof File) || audio.size === 0 || !Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: "invalid sample" }, { status: 400 });
  }

  try {
    const result = await uploadVoiceSample({ userId: user.id, voiceId, audio, index });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "upload failed" },
      { status: err instanceof Error && err.message === "voice not ready for cloning" ? 400 : 500 },
    );
  }
}
