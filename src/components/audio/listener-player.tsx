"use client";

import { useEffect } from "react";
import {
  AudioPlayerProvider,
  AudioPlayerButton,
  useAudioPlayer,
  useAudioPlayerTime,
} from "@/components/audio/audio-player";

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

/**
 * Полноэкранный тёмный плеер для публичных ссылок без авторизации
 * (/s/[token], /b/[token]) — экран слушателя-ребёнка, а не рабочий
 * инструмент владельца голоса: одна крупная кнопка воспроизведения, без
 * настроек скорости и прочих элементов, которые ребёнку не нужны (см.
 * "экран 6" в docs/Науз - дизайн.dc.html).
 */
export function ListenerPlayer({
  id,
  src,
  eyebrow,
  title,
  subtitle,
}: {
  id: string;
  src: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <AudioPlayerProvider>
      <ListenerPlayerInner id={id} src={src} eyebrow={eyebrow} title={title} subtitle={subtitle} />
    </AudioPlayerProvider>
  );
}

function ListenerPlayerInner({
  id,
  src,
  eyebrow,
  title,
  subtitle,
}: {
  id: string;
  src: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  const player = useAudioPlayer();
  const time = useAudioPlayerTime();
  const duration = player.duration;
  const started = player.isItemActive(id) && (player.isPlaying || time > 0);
  const progress = duration ? Math.min(100, (time / duration) * 100) : 0;

  // Без этого длительность не была известна, пока не нажмёшь play: src
  // проставляется в <audio> только через setActiveItem()/play(). Здесь
  // ставим сразу при монтировании — setActiveItem() только загружает
  // метаданные, не запускает воспроизведение.
  useEffect(() => {
    player.setActiveItem({ id, src });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, src]);

  return (
    <div className="flex flex-col items-center rounded-[28px] bg-[oklch(0.24_0.02_40)] px-7 py-10 text-center text-[oklch(0.93_0.02_60)]">
      {eyebrow && (
        <div className="mb-4 text-[13px] font-semibold tracking-wide text-[oklch(0.75_0.05_45)] uppercase">
          {eyebrow}
        </div>
      )}
      <h2 className="mb-1 font-serif text-2xl font-medium leading-snug">{title}</h2>
      <div className="mb-8 min-h-[16px] text-[13px] text-[oklch(0.65_0.02_55)]">
        {subtitle}
      </div>

      <AudioPlayerButton
        item={{ id, src }}
        size="icon"
        aria-label="Слушать"
        className="mb-8 h-[88px] w-[88px] rounded-full bg-[oklch(0.68_0.11_45)] text-[oklch(0.22_0.02_40)] hover:bg-[oklch(0.68_0.11_45)]/90 [&_svg]:size-7"
      />

      <div className="mb-2 h-1 w-full rounded-full bg-[oklch(0.35_0.03_45)]">
        <div
          className="h-1 rounded-full bg-[oklch(0.75_0.05_45)] transition-[width] duration-200"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="text-xs text-[oklch(0.65_0.02_55)]">
        {started
          ? `${formatTime(time)} · ${formatTime(duration ?? NaN)}`
          : duration
            ? `${formatTime(0)} · ${formatTime(duration)}`
            : "Нажмите, чтобы начать"}
      </div>
    </div>
  );
}
