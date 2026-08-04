import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Voice } from "@/lib/types";
import { StoryReader } from "./story-reader";
import { ShareLink } from "./share-link";

export default async function StoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: story } = await supabase
    .from("stories")
    .select("*")
    .eq("id", id)
    .single();

  if (!story) notFound();

  const { data: voices } = await supabase
    .from("voices")
    .select("*")
    .eq("status", "ready");

  const { data: generations } = await supabase
    .from("audio_generations")
    .select("*")
    .eq("story_id", id)
    .order("created_at", { ascending: false });

  const anyProcessing = (generations ?? []).some((g) => g.status === "processing");
  const anyFailed = (generations ?? []).some((g) => g.status === "failed");

  // Несколько голосов могут озвучить одну и ту же запись — берём самую
  // свежую готовую генерацию на каждый голос, а не только последнюю в
  // принципе (как раньше).
  const generationByVoiceId: Record<string, { audioUrl: string }> = {};
  for (const g of generations ?? []) {
    if (generationByVoiceId[g.voice_id] || g.status !== "ready" || !g.audio_url) continue;

    const { data } = await supabase.storage
      .from("audio-generations")
      .createSignedUrl(g.audio_url, 60 * 60);
    if (!data?.signedUrl) continue;

    generationByVoiceId[g.voice_id] = { audioUrl: data.signedUrl };
  }

  return (
    <main className="flex-1 max-w-2xl w-full mx-auto px-6 py-16 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{story.title}</h1>
        <Link href="/dashboard" className="text-sm text-neutral-500 underline">
          ← назад в дашборд
        </Link>
      </div>

      {anyProcessing && (
        <p className="text-sm text-neutral-500">Готовим аудио...</p>
      )}
      {anyFailed && (
        <p className="text-sm text-red-600">
          Не удалось сгенерировать аудио одним из голосов, попробуйте ещё раз.
        </p>
      )}

      <StoryReader
        storyId={story.id}
        voices={(voices as Voice[]) ?? []}
        generationByVoiceId={generationByVoiceId}
      />

      {Object.keys(generationByVoiceId).length > 0 && (
        <ShareLink
          storyId={story.id}
          baseUrl={process.env.NEXT_PUBLIC_SITE_URL ?? ""}
          token={story.share_token}
        />
      )}

      <p className="whitespace-pre-wrap text-neutral-700">{story.text}</p>
    </main>
  );
}
