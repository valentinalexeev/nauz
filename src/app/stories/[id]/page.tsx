import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  const { data: generation } = await supabase
    .from("audio_generations")
    .select("*")
    .eq("story_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  let audioUrl: string | null = null;
  if (generation?.audio_url) {
    const { data } = await supabase.storage
      .from("audio-generations")
      .createSignedUrl(generation.audio_url, 60 * 60);
    audioUrl = data?.signedUrl ?? null;
  }

  return (
    <main className="flex-1 max-w-2xl w-full mx-auto px-6 py-16 flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{story.title}</h1>

      {generation?.status === "processing" && (
        <p className="text-sm text-neutral-500">Готовим аудио...</p>
      )}
      {generation?.status === "failed" && (
        <p className="text-sm text-red-600">
          Не удалось сгенерировать аудио, попробуйте ещё раз.
        </p>
      )}
      {audioUrl && (
        <audio controls src={audioUrl} className="w-full">
          Ваш браузер не поддерживает воспроизведение аудио.
        </audio>
      )}

      <p className="whitespace-pre-wrap text-neutral-700">{story.text}</p>
    </main>
  );
}
