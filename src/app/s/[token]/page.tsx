import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ListenerPlayer } from "@/components/audio/listener-player";

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
 * Тёмный полноэкранный экран слушателя (см. "экран 6" в
 * docs/Науз - дизайн.dc.html) — без настроек скорости и прочего, что
 * нужно только владельцу голоса. Показывает ВСЕ голоса, которыми
 * озвучена запись, а не только последний — та же логика, что и на
 * приватной /stories/[id] и на публичной /b/[token] для книг.
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

  const latestReadyByVoiceId = new Map<string, string>();
  for (const g of generations ?? []) {
    if (latestReadyByVoiceId.has(g.voice_id) || !g.audio_url) continue;
    latestReadyByVoiceId.set(g.voice_id, g.audio_url);
  }

  // Один batch-запрос на все подписанные ссылки вместо N последовательных
  // createSignedUrl() на каждый голос.
  const { data: signedUrls } = latestReadyByVoiceId.size
    ? await admin.storage
        .from("audio-generations")
        .createSignedUrls([...latestReadyByVoiceId.values()], 60 * 60)
    : { data: [] as { path: string; signedUrl: string }[] };
  const signedUrlByPath = new Map((signedUrls ?? []).map((s) => [s.path, s.signedUrl]));

  const versions: { voiceLabel: string; audioUrl: string }[] = [];
  for (const [voiceId, path] of latestReadyByVoiceId) {
    const audioUrl = signedUrlByPath.get(path);
    if (!audioUrl) continue;
    versions.push({
      voiceLabel: voiceLabelById.get(voiceId) ?? "неизвестный голос",
      audioUrl,
    });
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-[oklch(0.22_0.02_40)] px-6 py-16">
      <div className="flex w-full max-w-md flex-col gap-5">
        {versions.length ? (
          versions.map((v, i) => (
            <ListenerPlayer
              key={i}
              id={`${story.id}:${v.voiceLabel}`}
              src={v.audioUrl}
              eyebrow={`от ${v.voiceLabel}`}
              title={story.title}
            />
          ))
        ) : (
          <p className="rounded-[28px] bg-white/5 px-7 py-10 text-center text-sm text-[oklch(0.65_0.02_55)]">
            Запись пока не готова.
          </p>
        )}
        <div className="pt-2 text-center text-[11px] tracking-wide text-[oklch(0.5_0.02_55)]">
          НАУЗ
        </div>
      </div>
    </main>
  );
}
