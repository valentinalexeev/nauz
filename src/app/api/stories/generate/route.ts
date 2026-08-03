import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateStoryAudio } from "@/lib/stories/generate-audio";

type GenerateRequestBody =
  | { voiceId: string; kind: "letter"; title: string; text: string; speed?: number }
  | { voiceId: string; kind: "fairy_tale"; templateId: string; speed?: number };

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as GenerateRequestBody;

  // Письма временно отключены: свободный текст (без модерации/лимитов)
  // иначе уходит в ElevenLabs буквально из тела запроса клиента.
  if (body.kind !== "fairy_tale") {
    return NextResponse.json(
      { error: "letters are temporarily disabled" },
      { status: 400 },
    );
  }

  try {
    const result = await generateStoryAudio({
      userId: user.id,
      voiceId: body.voiceId,
      templateId: body.templateId,
      speed: body.speed,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "generation failed";
    const status = ["voice not ready", "template not found", "invalid speed"].includes(
      message,
    )
      ? 400
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
