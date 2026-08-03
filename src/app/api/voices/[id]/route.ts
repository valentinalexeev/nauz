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
    // sample_audio_path — префикс папки с несколькими образцами (см.
    // clone-sample.ts), а не путь к одному файлу: перечисляем и удаляем всё
    // содержимое. Для голосов, созданных до перехода на несколько образцов,
    // path указывал на один файл напрямую — list() по нему вернёт пусто, и
    // тот файл просто останется висеть (не страшно, приватный бакет).
    const { data: files } = await admin.storage
      .from("voice-samples")
      .list(voice.sample_audio_path);
    const paths = (files ?? []).map((f) => `${voice.sample_audio_path}/${f.name}`);
    if (paths.length) {
      await admin.storage.from("voice-samples").remove(paths);
    }
  }

  const { count: generationsCount } = await admin
    .from("audio_generations")
    .select("id", { count: "exact", head: true })
    .eq("voice_id", voice.id);

  if (generationsCount && generationsCount > 0) {
    // У голоса есть готовые записи — не удаляем строку целиком (иначе список
    // сказок потеряет привязку "каким голосом записано"), а мягко помечаем
    // revoked: сам клон и сырой образец уже вычищены выше, аудиозаписи и их
    // файлы остаются нетронутыми, имя голоса продолжает отображаться.
    const { error } = await admin
      .from("voices")
      .update({ status: "revoked", elevenlabs_voice_id: null, sample_audio_path: null })
      .eq("id", voice.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // Записей нет — ничего не ссылается на этот голос, можно удалить полностью.
  // Каскадом удалятся связанные kyc_verifications (FK on delete cascade).
  const { error } = await admin.from("voices").delete().eq("id", voice.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
