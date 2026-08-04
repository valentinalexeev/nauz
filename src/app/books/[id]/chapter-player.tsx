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

/**
 * Recap-вопросы (если есть) → пауза → сама глава, тем же плеером
 * (AudioPlayerProvider/AudioPlayerButton), что и у обычных сказок — а не
 * нативным <audio controls>. Пауза настоящая, не просто переходная фраза
 * внутри одного файла: можно остановить отсчёт на неопределённое время
 * (обсудить с ребёнком вопросы) и продолжить, когда готовы, либо сразу
 * пропустить ожидание.
 */
export function ChapterPlayer({
  recapAudioUrl,
  chapterAudioUrl,
  recapDelaySeconds,
}: {
  recapAudioUrl: string | null;
  chapterAudioUrl: string;
  recapDelaySeconds: number;
}) {
  return (
    <AudioPlayerProvider>
      <ChapterPlayerInner
        recapAudioUrl={recapAudioUrl}
        chapterAudioUrl={chapterAudioUrl}
        recapDelaySeconds={recapDelaySeconds}
      />
    </AudioPlayerProvider>
  );
}

function ChapterPlayerInner({
  recapAudioUrl,
  chapterAudioUrl,
  recapDelaySeconds,
}: {
  recapAudioUrl: string | null;
  chapterAudioUrl: string;
  recapDelaySeconds: number;
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
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-neutral-100 px-4 py-3 text-sm">
        <span className="text-neutral-600">
          {countdown !== null
            ? `Глава начнётся через ${countdown} сек — время обсудить вопросы.`
            : "На паузе — обсуждаем вопросы. Нажмите «Продолжить», когда готовы."}
        </span>
        {countdown !== null && (
          <Button
            type="button"
            size="sm"
            variant="outline"
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

  return (
    <div className="flex items-center gap-3 rounded-lg border border-neutral-200 px-4 py-3">
      <AudioPlayerButton item={item} size="icon" variant="outline" />
      <AudioPlayerTime />
      <AudioPlayerProgress className="flex-1" />
      <AudioPlayerDuration />
      <AudioPlayerSpeed />
    </div>
  );
}
