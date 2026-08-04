import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Voice } from "@/lib/types";
import { AppShell } from "@/components/layout/app-shell";
import { StoryReader } from "./story-reader";
import { ShareLink } from "./share-link";

export default async function StoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
    <AppShell active="stories" userEmail={user?.email ?? null}>
      <h1 className="font-serif text-3xl font-medium text-ink">{story.title}</h1>

      {anyProcessing && <p className="text-sm text-ink-soft">Готовим аудио...</p>}
      {anyFailed && (
        <p className="text-sm text-destructive">
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

      <p className="whitespace-pre-wrap font-serif text-lg leading-relaxed text-ink-soft">
        {story.text}
      </p>
    </AppShell>
  );
}
