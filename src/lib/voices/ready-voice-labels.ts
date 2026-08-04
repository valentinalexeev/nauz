import "server-only";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Уникальные подписи голосов с хотя бы одной готовой генерацией по
 * значению внешнего ключа — общий helper для generateMetadata() на
 * /s/[token] и /b/[token] (превью ссылки в мессенджерах должно показывать
 * не только название, но и кто читает). Различаются только таблица
 * генераций (audio_generations vs book_chapter_generations) и имя
 * FK-колонки (story_id vs chapter_id/book_id) — сама логика "голоса →
 * уникальные подписи" одинакова.
 */
export async function getReadyVoiceLabels(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  table: "audio_generations" | "book_chapter_generations",
  fkColumn: string,
  fkValue: string,
): Promise<string[]> {
  const { data: generations } = await admin
    .from(table)
    .select("voice_id")
    .eq(fkColumn, fkValue)
    .eq("status", "ready");
  const voiceIds = [...new Set((generations ?? []).map((g) => g.voice_id as string))];
  if (!voiceIds.length) return [];

  const { data: voices } = await admin.from("voices").select("label").in("id", voiceIds);
  return [...new Set((voices ?? []).map((v) => v.label as string))];
}
