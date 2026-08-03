import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateSpeech } from "@/lib/elevenlabs/client";
import { embedWatermark } from "@/lib/watermark";
import type { StoryKind } from "@/lib/types";

const ALLOWED_SPEEDS = [0.8, 0.9, 1.0, 1.1, 1.2];

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

  const speed = body.speed ?? 1.0;

  if (!ALLOWED_SPEEDS.includes(speed)) {
    return NextResponse.json({ error: "invalid speed" }, { status: 400 });
  }

  // Проверяем, что голос принадлежит пользователю и готов к использованию
  const { data: voice } = await supabase
    .from("voices")
    .select("*")
    .eq("id", body.voiceId)
    .eq("owner_id", user.id)
    .eq("status", "ready")
    .single();

  if (!voice?.elevenlabs_voice_id) {
    return NextResponse.json({ error: "voice not ready" }, { status: 400 });
  }

  // body.kind гарантированно "fairy_tale" — letter отклонён проверкой выше.
  const { data: template } = await supabase
    .from("story_templates")
    .select("*")
    .eq("id", body.templateId)
    .single();

  if (!template) {
    return NextResponse.json({ error: "template not found" }, { status: 404 });
  }

  const kind: StoryKind = "fairy_tale";
  const title = template.title;
  const displayText = template.text_plain;
  const ttsText = template.text_marked;
  const languageCode = template.language;
  const templateId = template.id;

  const { data: story, error: storyError } = await supabase
    .from("stories")
    .insert({
      owner_id: user.id,
      kind,
      title,
      text: displayText,
      template_id: templateId,
    })
    .select()
    .single();

  if (storyError || !story) {
    return NextResponse.json({ error: storyError?.message }, { status: 500 });
  }

  const admin = createSupabaseAdminClient();
  const { data: generation } = await admin
    .from("audio_generations")
    .insert({
      story_id: story.id,
      voice_id: voice.id,
      owner_id: user.id,
      status: "processing",
    })
    .select()
    .single();

  try {
    const audio = await generateSpeech({
      voiceId: voice.elevenlabs_voice_id,
      text: ttsText,
      languageCode,
      speed,
    });
    const { audio: watermarkedAudio, watermarkId } = await embedWatermark(
      audio,
      {
        ownerId: user.id,
        voiceId: voice.id,
        generationId: generation!.id,
      },
    );

    const path = `${user.id}/${generation!.id}.mp3`;
    const { error: uploadError } = await admin.storage
      .from("audio-generations")
      .upload(path, Buffer.from(watermarkedAudio), {
        contentType: "audio/mpeg",
      });

    if (uploadError) throw uploadError;

    await admin
      .from("audio_generations")
      .update({ status: "ready", audio_url: path, watermark_id: watermarkId })
      .eq("id", generation!.id);
  } catch (err) {
    await admin
      .from("audio_generations")
      .update({ status: "failed" })
      .eq("id", generation!.id);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "generation failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ storyId: story.id });
}
