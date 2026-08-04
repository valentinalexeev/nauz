"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Voice } from "@/lib/types";
import { SPEED_OPTIONS } from "@/lib/stories/speed-options";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { StoryPlayer } from "./story-player";

/**
 * Список готовых озвучек сказки/письма разными голосами + форма добавить
 * ещё одну — то же самое устройство, что и BookReader для глав книг:
 * одна и та же запись (story) может иметь несколько независимых
 * audio_generations по voice_id, все они показываются сразу, а не только
 * последняя.
 */
export function StoryReader({
  storyId,
  voices,
  generationByVoiceId,
}: {
  storyId: string;
  voices: Voice[];
  generationByVoiceId: Record<string, { audioUrl: string }>;
}) {
  const router = useRouter();
  const [nextVoiceId, setNextVoiceId] = useState(voices[0]?.id ?? "");
  const [speed, setSpeed] = useState(1.0);
  // Ключ — voiceId, а не булево значение: несколько голосов можно
  // озвучивать параллельно, каждый со своим независимым индикатором.
  const [generatingKeys, setGeneratingKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const existingVoices = voices.filter((v) => generationByVoiceId[v.id]);

  if (!voices.length) {
    return (
      <p className="rounded-2xl border border-dashed border-border px-5 py-8 text-center text-sm text-ink-soft">
        Сначала нужен хотя бы один готовый голос —{" "}
        <Link href="/voices/new" className="text-clay underline">
          добавьте его здесь
        </Link>
        .
      </p>
    );
  }

  async function handleGenerate() {
    const key = nextVoiceId;
    setGeneratingKeys((prev) => new Set(prev).add(key));
    setError(null);

    const res = await fetch(`/api/stories/${storyId}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceId: nextVoiceId, speed }),
    });

    setGeneratingKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Не удалось озвучить запись");
      return;
    }

    router.refresh();
  }

  const alreadyHasNextVoice = existingVoices.some((v) => v.id === nextVoiceId);
  const generating = generatingKeys.has(nextVoiceId);

  return (
    <div className="flex flex-col gap-4">
      {existingVoices.map((v) => {
        const generation = generationByVoiceId[v.id];
        return (
          <div key={v.id} className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-ink-soft">Голос: {v.label}</span>
            <StoryPlayer storyId={`${storyId}:${v.id}`} audioUrl={generation.audioUrl} />
          </div>
        );
      })}

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border px-4 py-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="voice-select" className="text-xs text-ink-soft">
            {existingVoices.length ? "Озвучить ещё одним голосом:" : "Чьим голосом озвучить?"}
          </Label>
          <Select
            id="voice-select"
            value={nextVoiceId}
            onChange={(e) => setNextVoiceId(e.target.value)}
            className="w-auto"
          >
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="speed-select" className="text-xs text-ink-soft">
            Скорость речи
          </Label>
          <Select
            id="speed-select"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="w-auto"
          >
            {SPEED_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>
        <Button type="button" size="sm" disabled={generating} onClick={handleGenerate}>
          {generating ? "Озвучиваем..." : alreadyHasNextVoice ? "Переозвучить" : "Озвучить"}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
