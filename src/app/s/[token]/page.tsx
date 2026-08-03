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

  const { data: generation } = await admin
    .from("audio_generations")
    .select("*")
    .eq("story_id", story.id)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  let audioUrl: string | null = null;
  if (generation?.audio_url) {
    const { data } = await admin.storage
      .from("audio-generations")
      .createSignedUrl(generation.audio_url, 60 * 60);
    audioUrl = data?.signedUrl ?? null;
  }

  return (
    <main className="flex-1 max-w-2xl w-full mx-auto px-6 py-16 flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{story.title}</h1>

      {audioUrl ? (
        <StoryPlayer storyId={story.id} audioUrl={audioUrl} />
      ) : (
        <p className="text-sm text-neutral-500">Запись пока не готова.</p>
      )}

      <p className="whitespace-pre-wrap text-neutral-700">{story.text}</p>
    </main>
  );
}
