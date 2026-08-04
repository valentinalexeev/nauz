"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Recap-вопросы (если есть) → пауза → сама глава. Пауза настоящая, не
 * просто переходная фраза внутри одного файла: можно остановить отсчёт
 * на неопределённое время (обсудить с ребёнком вопросы) и продолжить,
 * когда готовы, либо сразу пропустить ожидание.
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
  const [stage, setStage] = useState<"recap" | "waiting" | "chapter">(
    recapAudioUrl ? "recap" : "chapter",
  );
  const [countdown, setCountdown] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

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
      audioRef.current?.play().catch(() => {});
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

  const src = stage === "recap" ? recapAudioUrl! : chapterAudioUrl;

  return (
    <audio
      ref={audioRef}
      controls
      src={src}
      className="w-full"
      onEnded={() => {
        if (stage === "recap") setStage("waiting");
      }}
    />
  );
}
