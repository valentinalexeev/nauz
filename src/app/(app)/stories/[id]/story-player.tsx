"use client";

import { useEffect } from "react";
import {
  AudioPlayerProvider,
  AudioPlayerButton,
  AudioPlayerProgress,
  AudioPlayerTime,
  AudioPlayerDuration,
  AudioPlayerSpeed,
  useAudioPlayer,
} from "@/components/audio/audio-player";

export function StoryPlayer({
  storyId,
  audioUrl,
}: {
  storyId: string;
  audioUrl: string;
}) {
  return (
    <AudioPlayerProvider>
      <StoryPlayerControls storyId={storyId} audioUrl={audioUrl} />
    </AudioPlayerProvider>
  );
}

function StoryPlayerControls({
  storyId,
  audioUrl,
}: {
  storyId: string;
  audioUrl: string;
}) {
  const player = useAudioPlayer();

  // Без этого длительность не была известна, пока не нажмёшь play: у
  // <audio> внутри AudioPlayerProvider src проставляется только через
  // setActiveItem()/play(), а до первого нажатия элемент вообще не знал,
  // что за файл будет играть. setActiveItem() только загружает метаданные
  // (readyState HAVE_METADATA), не запускает воспроизведение.
  useEffect(() => {
    player.setActiveItem({ id: storyId, src: audioUrl });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyId, audioUrl]);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
      <AudioPlayerButton
        item={{ id: storyId, src: audioUrl }}
        size="icon"
        variant="default"
        className="rounded-full"
      />
      <AudioPlayerTime />
      <AudioPlayerProgress className="flex-1" />
      <AudioPlayerDuration />
      <AudioPlayerSpeed />
    </div>
  );
}
