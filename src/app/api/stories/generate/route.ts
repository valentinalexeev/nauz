import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateSpeech } from "@/lib/elevenlabs/client";
import { embedWatermark } from "@/lib/watermark";
import type { StoryKind } from "@/lib/types";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { voiceId, kind, title, text } = (await request.json()) as {
    voiceId: string;
    kind: StoryKind;
    title: string;
    text: string;
  };

  // Проверяем, что голос принадлежит пользователю и готов к использованию
  const { data: voice } = await supabase
    .from("voices")
    .select("*")
    .eq("id", voiceId)
    .eq("owner_id", user.id)
    .eq("status", "ready")
    .single();

  if (!voice?.elevenlabs_voice_id) {
    return NextResponse.json({ error: "voice not ready" }, { status: 400 });
  }

  const { data: story, error: storyError } = await supabase
    .from("stories")
    .insert({ owner_id: user.id, kind, title, text })
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
      text,
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
