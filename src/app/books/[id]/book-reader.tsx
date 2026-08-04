"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Voice } from "@/lib/types";
import { SPEED_OPTIONS } from "@/lib/stories/speed-options";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChapterPlayer } from "./chapter-player";

// Supabase-клиент отдаёт строки как есть (snake_case) — доменный тип
// BookChapter в src/lib/types.ts camelCase и для приведения типов из
// серверных запросов не подходит, поэтому здесь отдельный "сырой" тип.
export interface RawBookChapter {
  id: string;
  book_id: string;
  order_index: number;
  title: string;
  text_plain: string;
}

export interface ChapterGeneration {
  audioUrl: string;
  recapAudioUrl: string | null;
  recapDelaySeconds: number;
}

export function BookReader({
  bookId,
  chapters,
  voices,
  generationByKey,
}: {
  bookId: string;
  chapters: RawBookChapter[];
  voices: Voice[];
  generationByKey: Record<string, ChapterGeneration>;
}) {
  const router = useRouter();
  const [voiceId, setVoiceId] = useState(voices[0]?.id ?? "");
  const [speed, setSpeed] = useState(1.0);
  const [includeRecap, setIncludeRecap] = useState(true);
  const [recapDelaySeconds, setRecapDelaySeconds] = useState(5);
  const [generatingChapterId, setGeneratingChapterId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!voices.length) {
    return (
      <p className="text-sm text-neutral-500">
        Сначала нужен хотя бы один готовый голос —{" "}
        <Link href="/voices/new" className="underline">
          добавьте его здесь
        </Link>
        .
      </p>
    );
  }

  async function handleGenerate(chapterId: string) {
    setGeneratingChapterId(chapterId);
    setError(null);

    const res = await fetch(`/api/books/${bookId}/chapters/${chapterId}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceId, speed, includeRecap, recapDelaySeconds }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Не удалось озвучить главу");
      setGeneratingChapterId(null);
      return;
    }

    router.refresh();
    setGeneratingChapterId(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="voice-select">Чьим голосом читать?</Label>
          <Select
            id="voice-select"
            value={voiceId}
            onChange={(e) => setVoiceId(e.target.value)}
          >
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="speed-select">Скорость речи</Label>
          <Select
            id="speed-select"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          >
            {SPEED_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="recap-delay">Пауза перед главой, сек</Label>
          <Input
            id="recap-delay"
            type="number"
            min={0}
            max={60}
            disabled={!includeRecap}
            value={recapDelaySeconds}
            onChange={(e) => setRecapDelaySeconds(Number(e.target.value))}
            className="w-24"
          />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={includeRecap}
            onChange={(e) => setIncludeRecap(e.target.checked)}
          />
          Вопросы по предыдущей главе
        </label>
      </div>
      <p className="text-xs text-neutral-500">
        Настройки применяются при озвучке новой главы — уже готовые записи
        не меняются.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="flex flex-col gap-4">
        {chapters
          .sort((a, b) => a.order_index - b.order_index)
          .map((chapter) => {
            const generation = generationByKey[`${chapter.id}:${voiceId}`];
            const generating = generatingChapterId === chapter.id;
            return (
              <li
                key={chapter.id}
                id={`chapter-${chapter.order_index}`}
                className="rounded-lg border border-neutral-200 px-4 py-4 flex flex-col gap-3 scroll-mt-6"
              >
                <p className="text-sm font-medium text-neutral-900">
                  Глава {chapter.order_index}. {chapter.title}
                </p>
                <p className="whitespace-pre-wrap text-sm text-neutral-600">
                  {chapter.text_plain}
                </p>
                {generation ? (
                  <ChapterPlayer
                    recapAudioUrl={generation.recapAudioUrl}
                    chapterAudioUrl={generation.audioUrl}
                    recapDelaySeconds={generation.recapDelaySeconds}
                  />
                ) : (
                  <Button
                    type="button"
                    disabled={generating}
                    onClick={() => handleGenerate(chapter.id)}
                    className="rounded-full w-fit"
                  >
                    {generating ? "Озвучиваем..." : "Озвучить главу"}
                  </Button>
                )}
              </li>
            );
          })}
      </ul>
    </div>
  );
}
