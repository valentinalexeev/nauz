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
import { cn } from "@/lib/utils";
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
  siteUrl,
}: {
  bookId: string;
  chapters: RawBookChapter[];
  voices: Voice[];
  generationByKey: Record<string, ChapterGeneration>;
  siteUrl: string;
}) {
  const router = useRouter();
  // Разные главы одной книги может читать разный голос — выбор голоса
  // per-chapter, а не один общий на всю книгу.
  const [chapterVoiceId, setChapterVoiceId] = useState<Record<string, string>>(
    () => Object.fromEntries(chapters.map((c) => [c.id, voices[0]?.id ?? ""])),
  );
  const [speed, setSpeed] = useState(1.0);
  const [includeRecap, setIncludeRecap] = useState(true);
  const [recapDelaySeconds, setRecapDelaySeconds] = useState(5);
  // Ключ chapterId:voiceId, а не просто chapterId — иначе UI не мог
  // корректно отследить несколько одновременных озвучек (например, двух
  // разных глав или двух голосов одной главы параллельно): единственное
  // значение "какая глава сейчас озвучивается" сбивалось со второй
  // одновременной генерации, хотя сами запросы на сервере не блокируют
  // друг друга и параллелятся нормально.
  const [generatingKeys, setGeneratingKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

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

  async function handleGenerate(chapterId: string, voiceId: string) {
    const key = `${chapterId}:${voiceId}`;
    setGeneratingKeys((prev) => new Set(prev).add(key));
    setError(null);

    const res = await fetch(`/api/books/${bookId}/chapters/${chapterId}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceId, speed, includeRecap, recapDelaySeconds }),
    });

    setGeneratingKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Не удалось озвучить главу");
      return;
    }

    router.refresh();
  }

  async function handleShare() {
    setSharing(true);
    setError(null);

    const res = await fetch(`/api/books/${bookId}/share`, { method: "POST" });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Не удалось создать ссылку");
      setSharing(false);
      return;
    }

    const { shareToken } = (await res.json()) as { shareToken: string };
    setShareUrl(`${siteUrl}/b/${shareToken}`);
    setSharing(false);
  }

  async function handleCopyShare() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-border px-5 py-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="speed-select" className="text-xs text-ink-soft">Скорость речи</Label>
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
          <Label htmlFor="recap-delay" className="text-xs text-ink-soft">Пауза перед главой, сек</Label>
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
        <button
          type="button"
          onClick={() => setIncludeRecap((v) => !v)}
          className="flex items-center gap-2.5 pb-1.5 text-sm text-ink"
        >
          <span
            className={cn(
              "relative h-[26px] w-11 shrink-0 rounded-full transition-colors",
              includeRecap ? "bg-clay" : "bg-border",
            )}
          >
            <span
              className={cn(
                "absolute top-[3px] h-5 w-5 rounded-full bg-white transition-all",
                includeRecap ? "left-[21px]" : "left-[3px]",
              )}
            />
          </span>
          Вопросы по предыдущей главе
        </button>
      </div>
      <p className="text-xs text-ink-soft">
        Эти настройки применяются при озвучке новой главы — уже готовые
        записи не меняются. Голос выбирается отдельно для каждой главы ниже
        — можно, например, читать одну главу мамой, другую папой.
      </p>

      <div className="flex flex-col gap-2.5 rounded-xl bg-surface px-5 py-4 text-sm">
        <p className="text-ink-soft">
          Ссылка на книгу без входа в Науз — покажет все главы, какими бы
          вашими голосами вы их ни озвучили.
        </p>
        {shareUrl ? (
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={shareUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 rounded-lg border border-border bg-paper px-3 py-1.5 text-xs text-ink"
            />
            <Button type="button" size="sm" onClick={handleCopyShare}>
              {copied ? "Скопировано" : "Скопировать"}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={sharing}
            onClick={handleShare}
            className="w-fit"
          >
            {sharing ? "Создаём ссылку..." : "Получить ссылку"}
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <ul className="flex flex-col gap-4">
        {chapters
          .sort((a, b) => a.order_index - b.order_index)
          .map((chapter) => {
            // Несколько голосов могут озвучить одну и ту же главу — держим
            // все готовые версии сразу, а не только последнюю выбранную.
            const existingVoices = voices.filter(
              (v) => generationByKey[`${chapter.id}:${v.id}`],
            );
            const nextVoiceId = chapterVoiceId[chapter.id] ?? voices[0]?.id ?? "";
            const alreadyHasNextVoice = existingVoices.some((v) => v.id === nextVoiceId);
            const generating = generatingKeys.has(`${chapter.id}:${nextVoiceId}`);
            return (
              <li
                key={chapter.id}
                id={`chapter-${chapter.order_index}`}
                className="flex scroll-mt-6 flex-col gap-3 rounded-2xl border border-border px-5 py-5"
              >
                <p className="text-sm font-semibold text-ink">
                  Глава {chapter.order_index}. {chapter.title}
                </p>
                <p className="whitespace-pre-wrap text-sm text-ink-soft">
                  {chapter.text_plain}
                </p>

                {existingVoices.map((v) => {
                  const generation = generationByKey[`${chapter.id}:${v.id}`];
                  return (
                    <div key={v.id} className="flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-ink-soft">Голос: {v.label}</span>
                      <ChapterPlayer
                        recapAudioUrl={generation.recapAudioUrl}
                        chapterAudioUrl={generation.audioUrl}
                        recapDelaySeconds={generation.recapDelaySeconds}
                      />
                    </div>
                  );
                })}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Label htmlFor={`voice-select-${chapter.id}`} className="text-xs text-ink-soft">
                    {existingVoices.length ? "Озвучить ещё одним голосом:" : "Кто прочитает?"}
                  </Label>
                  <Select
                    id={`voice-select-${chapter.id}`}
                    value={nextVoiceId}
                    onChange={(e) =>
                      setChapterVoiceId((prev) => ({
                        ...prev,
                        [chapter.id]: e.target.value,
                      }))
                    }
                    className="w-auto"
                  >
                    {voices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    disabled={generating}
                    onClick={() => handleGenerate(chapter.id, nextVoiceId)}
                  >
                    {generating
                      ? "Озвучиваем..."
                      : alreadyHasNextVoice
                        ? "Переозвучить"
                        : "Озвучить"}
                  </Button>
                </div>
              </li>
            );
          })}
      </ul>
    </div>
  );
}
