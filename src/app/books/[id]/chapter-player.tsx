"use client";

import { useEffect, useRef, useState } from "react";
import {
  AudioPlayerProvider,
  AudioPlayerButton,
  AudioPlayerProgress,
  AudioPlayerTime,
  AudioPlayerDuration,
  AudioPlayerSpeed,
  useAudioPlayer,
} from "@/components/audio/audio-player";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Recap-вопросы (если есть) → пауза → сама глава, тем же плеером
 * (AudioPlayerProvider/AudioPlayerButton), что и у обычных сказок — а не
 * нативным <audio controls>. Пауза настоящая, не просто переходная фраза
 * внутри одного файла: можно остановить отсчёт на неопределённое время
 * (обсудить с ребёнком вопросы) и продолжить, когда готовы, либо сразу
 * пропустить ожидание.
 *
 * `dark` — тёмный вариант для публичной ссылки без авторизации (см.
 * /b/[token]), где плеер — экран слушателя-ребёнка, а не рабочий
 * инструмент владельца голоса.
 */
export function ChapterPlayer({
  recapAudioUrl,
  chapterAudioUrl,
  recapDelaySeconds,
  dark = false,
}: {
  recapAudioUrl: string | null;
  chapterAudioUrl: string;
  recapDelaySeconds: number;
  dark?: boolean;
}) {
  return (
    <AudioPlayerProvider>
      <ChapterPlayerInner
        recapAudioUrl={recapAudioUrl}
        chapterAudioUrl={chapterAudioUrl}
        recapDelaySeconds={recapDelaySeconds}
        dark={dark}
      />
    </AudioPlayerProvider>
  );
}

function ChapterPlayerInner({
  recapAudioUrl,
  chapterAudioUrl,
  recapDelaySeconds,
  dark,
}: {
  recapAudioUrl: string | null;
  chapterAudioUrl: string;
  recapDelaySeconds: number;
  dark: boolean;
}) {
  const player = useAudioPlayer();
  const [stage, setStage] = useState<"recap" | "waiting" | "chapter">(
    recapAudioUrl ? "recap" : "chapter",
  );
  const [countdown, setCountdown] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  // AudioPlayerProvider не даёт колбэк на "ended" — слушаем сам элемент
  // через общий ref, чтобы переключиться с recap на паузу, когда он
  // доиграл до конца.
  useEffect(() => {
    const audio = player.ref.current;
    if (!audio) return;
    function handleEnded() {
      if (stage === "recap") setStage("waiting");
    }
    audio.addEventListener("ended", handleEnded);
    return () => audio.removeEventListener("ended", handleEnded);
  }, [player.ref, stage]);

  useEffect(() => {
    if (stage !== "waiting") return;
    if (recapDelaySeconds <= 0) {
      setStage("chapter");
      return;
    }
    setCountdown(recapDelaySeconds);
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c === null || c <= 1) {
          clearTimer();
          setStage("chapter");
          return null;
        }
        return c - 1;
      });
    }, 1000);
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  useEffect(() => {
    // Автоплей главы только когда до неё реально дошли после recap/паузы —
    // если recap не было вовсе, глава остаётся на обычный ручной запуск.
    if (stage === "chapter" && recapAudioUrl) {
      player.play({ id: "chapter", src: chapterAudioUrl });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  if (stage === "waiting") {
    return (
      <div
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 text-sm",
          dark ? "bg-white/10 text-[oklch(0.93_0.02_60)]" : "bg-surface text-ink-soft",
        )}
      >
        <span>
          {countdown !== null
            ? `Глава начнётся через ${countdown} сек — время обсудить вопросы.`
            : "На паузе — обсуждаем вопросы. Нажмите «Продолжить», когда готовы."}
        </span>
        {countdown !== null && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={dark ? "border-white/30 bg-transparent text-white hover:bg-white/10" : undefined}
            onClick={() => {
              clearTimer();
              setCountdown(null);
            }}
          >
            Пауза
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          onClick={() => {
            clearTimer();
            setStage("chapter");
          }}
        >
          Продолжить главу
        </Button>
      </div>
    );
  }

  const item =
    stage === "recap" ? { id: "recap", src: recapAudioUrl! } : { id: "chapter", src: chapterAudioUrl };

  if (dark) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3 text-[oklch(0.93_0.02_60)]">
        <AudioPlayerButton
          item={item}
          size="icon"
          className="rounded-full bg-[oklch(0.68_0.11_45)] text-[oklch(0.22_0.02_40)] hover:bg-[oklch(0.68_0.11_45)]/90"
        />
        <AudioPlayerTime className="text-[oklch(0.75_0.05_45)]" />
        <AudioPlayerProgress className="flex-1" />
        <AudioPlayerDuration className="text-[oklch(0.75_0.05_45)]" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
      <AudioPlayerButton item={item} size="icon" variant="default" className="rounded-full" />
      <AudioPlayerTime />
      <AudioPlayerProgress className="flex-1" />
      <AudioPlayerDuration />
      <AudioPlayerSpeed />
    </div>
  );
}
