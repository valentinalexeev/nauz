import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { deleteVoice } from "@/lib/elevenlabs/client";

export async function DELETE(
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

  const { data: voice } = await supabase
    .from("voices")
    .select("*")
    .eq("id", voiceId)
    .eq("owner_id", user.id)
    .single();

  if (!voice) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Нет RLS-политики delete на voices — удаляем через service-role клиент,
  // владение уже проверено выше user-scoped запросом.
  const admin = createSupabaseAdminClient();

  // Внешние ресурсы чистим best-effort: сбой очистки не должен мешать
  // пользователю удалить запись из приложения.
  if (voice.elevenlabs_voice_id) {
    try {
      await deleteVoice(voice.elevenlabs_voice_id);
    } catch {
      // голос мог быть уже удалён на стороне ElevenLabs — игнорируем
    }
  }

  if (voice.sample_audio_path) {
    await admin.storage.from("voice-samples").remove([voice.sample_audio_path]);
  }

  const { data: generations } = await admin
    .from("audio_generations")
    .select("audio_url")
    .eq("voice_id", voice.id);
  const paths = (generations ?? [])
    .map((g) => g.audio_url)
    .filter((p): p is string => Boolean(p));
  if (paths.length) {
    await admin.storage.from("audio-generations").remove(paths);
  }

  // Удаление voices каскадом удалит связанные kyc_verifications и
  // audio_generations (FK on delete cascade), stories не затрагиваются.
  const { error } = await admin.from("voices").delete().eq("id", voice.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
