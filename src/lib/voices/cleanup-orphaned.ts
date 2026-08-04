import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { deleteVoice } from "@/lib/elevenlabs/client";

/**
 * Голос помечается revoked (см. DELETE /api/voices/[id]) и остаётся в
 * таблице только как подпись к уже существующим записям — сам клон в
 * ElevenLabs и сырой образец к этому моменту уже удалены. Как только
 * последняя запись, ссылающаяся на такой голос, тоже удаляется (например,
 * через DELETE /api/stories/[id]), голос больше ничему не подписывает и
 * должен исчезнуть из базы полностью — эта функция проверяет условие и
 * удаляет строку, если оно выполнено.
 *
 * Только для уже revoked голосов: активный/готовый голос без записей —
 * нормальное состояние ("ещё не озвучили ничего"), его удалять нельзя.
 */
export async function deleteVoiceIfOrphaned(voiceId: string): Promise<void> {
  const admin = createSupabaseAdminClient();

  const { data: voice } = await admin
    .from("voices")
    .select("*")
    .eq("id", voiceId)
    .single();

  if (!voice || voice.status !== "revoked") return;

  const [{ count: storyGenCount }, { count: chapterGenCount }] = await Promise.all([
    admin
      .from("audio_generations")
      .select("id", { count: "exact", head: true })
      .eq("voice_id", voiceId),
    admin
      .from("book_chapter_generations")
      .select("id", { count: "exact", head: true })
      .eq("voice_id", voiceId),
  ]);

  if ((storyGenCount ?? 0) > 0 || (chapterGenCount ?? 0) > 0) return;

  // Best-effort подчистка — в норме оба поля уже null/очищены при revoke,
  // но на случай более старых данных не полагаемся на это.
  if (voice.elevenlabs_voice_id) {
    try {
      await deleteVoice(voice.elevenlabs_voice_id);
    } catch {
      // голос мог быть уже удалён на стороне ElevenLabs — игнорируем
    }
  }
  if (voice.sample_audio_path) {
    const { data: files } = await admin.storage
      .from("voice-samples")
      .list(voice.sample_audio_path);
    const paths = (files ?? []).map((f) => `${voice.sample_audio_path}/${f.name}`);
    if (paths.length) {
      await admin.storage.from("voice-samples").remove(paths);
    }
  }

  await admin.from("voices").delete().eq("id", voiceId);
}
