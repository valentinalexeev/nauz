import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { cloneVoice } from "@/lib/elevenlabs/client";

function extensionForAudioMimeType(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

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

  // Проверяем, что голос принадлежит пользователю и прошёл KYC.
  // "failed" тоже допускается — так можно повторить попытку клонирования
  // тем же голосом после сбоя, не создавая новую запись и не проходя KYC заново.
  const { data: voice } = await supabase
    .from("voices")
    .select("*")
    .eq("id", voiceId)
    .eq("owner_id", user.id)
    .in("status", ["kyc_approved", "failed"])
    .single();

  if (!voice) {
    return NextResponse.json(
      { error: "voice not ready for cloning" },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdminClient();
  await admin.from("voices").update({ status: "cloning" }).eq("id", voice.id);

  try {
    const samplePath = `${user.id}/${voice.id}.${extensionForAudioMimeType(audio.type)}`;
    const { error: uploadError } = await admin.storage
      .from("voice-samples")
      .upload(samplePath, audio, {
        contentType: audio.type || "audio/webm",
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // Имя в ElevenLabs должно позволять сопоставить голос с пользователем
    // Науз — иначе в списке голосов аккаунта видно только ярлык вида
    // "Папа", без понимания, чей это профиль.
    const { voiceId: elevenlabsVoiceId } = await cloneVoice({
      name: `Науз: ${user.email} — ${voice.label}`,
      files: [audio],
    });

    await admin
      .from("voices")
      .update({
        status: "ready",
        elevenlabs_voice_id: elevenlabsVoiceId,
        sample_audio_path: samplePath,
      })
      .eq("id", voice.id);
  } catch (err) {
    await admin.from("voices").update({ status: "failed" }).eq("id", voice.id);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "cloning failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ status: "ready" });
}
