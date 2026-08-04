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
  const latestReadyByVoiceId = new Map<string, string>();
  for (const g of generations ?? []) {
    if (latestReadyByVoiceId.has(g.voice_id) || g.status !== "ready" || !g.audio_url) continue;
    latestReadyByVoiceId.set(g.voice_id, g.audio_url);
  }

  // Один batch-запрос на все подписанные ссылки вместо N последовательных
  // createSignedUrl() — раньше каждый голос добавлял ещё один round-trip к
  // Storage API, из-за чего страница заметно тормозила с ростом числа
  // озвучек одной записи.
  const { data: signedUrls } = latestReadyByVoiceId.size
    ? await supabase.storage
        .from("audio-generations")
        .createSignedUrls([...latestReadyByVoiceId.values()], 60 * 60)
    : { data: [] as { path: string; signedUrl: string }[] };
  const signedUrlByPath = new Map((signedUrls ?? []).map((s) => [s.path, s.signedUrl]));

  const generationByVoiceId: Record<string, { audioUrl: string }> = {};
  for (const [voiceId, path] of latestReadyByVoiceId) {
    const signedUrl = signedUrlByPath.get(path);
    if (signedUrl) generationByVoiceId[voiceId] = { audioUrl: signedUrl };
  }

  return (
    <>
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
    </>
  );
}
