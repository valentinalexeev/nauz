import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { StoryPlayer } from "@/app/stories/[id]/story-player";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const admin = createSupabaseAdminClient();
  const { data: story } = await admin
    .from("stories")
    .select("title")
    .eq("share_token", token)
    .single();

  return { title: story ? `Науз — ${story.title}` : "Науз" };
}

/**
 * Публичная страница плеера по невидимому токену — без авторизации,
 * чтобы ссылку можно было отправить ребёнку. Токен непредсказуем
 * (16 случайных байт, см. миграцию 0013), поэтому admin-клиент здесь
 * оправдан: сама секретность — в токене, а не в Supabase-сессии.
 *
 * Показывает ВСЕ голоса, которыми озвучена запись, а не только последний —
 * та же логика, что и на приватной /stories/[id] и на публичной /b/[token]
 * для книг: одна запись может быть прочитана несколькими голосами
 * владельца, все версии равноправны.
 */
export default async function SharedStoryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const admin = createSupabaseAdminClient();

  const { data: story } = await admin
    .from("stories")
    .select("*")
    .eq("share_token", token)
    .single();

  if (!story) notFound();

  const { data: generations } = await admin
    .from("audio_generations")
    .select("voice_id, audio_url")
    .eq("story_id", story.id)
    .eq("status", "ready")
    .order("created_at", { ascending: false });

  const voiceIds = [...new Set((generations ?? []).map((g) => g.voice_id))];
  const { data: voices } = voiceIds.length
    ? await admin.from("voices").select("id, label").in("id", voiceIds)
    : { data: [] as { id: string; label: string }[] };
  const voiceLabelById = new Map((voices ?? []).map((v) => [v.id, v.label]));

  const versions: { voiceLabel: string; audioUrl: string }[] = [];
  const seenVoice = new Set<string>();
  for (const g of generations ?? []) {
    if (seenVoice.has(g.voice_id) || !g.audio_url) continue;
    seenVoice.add(g.voice_id);

    const { data } = await admin.storage
      .from("audio-generations")
      .createSignedUrl(g.audio_url, 60 * 60);
    if (!data?.signedUrl) continue;

    versions.push({
      voiceLabel: voiceLabelById.get(g.voice_id) ?? "неизвестный голос",
      audioUrl: data.signedUrl,
    });
  }

  return (
    <main className="flex-1 max-w-2xl w-full mx-auto px-6 py-16 flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{story.title}</h1>

      {versions.length ? (
        <div className="flex flex-col gap-4">
          {versions.map((v, i) => (
            <div key={i} className="flex flex-col gap-1">
              <span className="text-xs text-neutral-500">Голос: {v.voiceLabel}</span>
              <StoryPlayer storyId={`${story.id}:${v.voiceLabel}`} audioUrl={v.audioUrl} />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-neutral-500">Запись пока не готова.</p>
      )}

      <p className="whitespace-pre-wrap text-neutral-700">{story.text}</p>
    </main>
  );
}
