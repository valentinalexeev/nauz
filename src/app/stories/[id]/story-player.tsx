"use client";

import {
  AudioPlayerProvider,
  AudioPlayerButton,
  AudioPlayerProgress,
  AudioPlayerTime,
  AudioPlayerDuration,
  AudioPlayerSpeed,
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
  return (
    <div className="flex items-center gap-3 rounded-lg border border-neutral-200 px-4 py-3">
      <AudioPlayerButton
        item={{ id: storyId, src: audioUrl }}
        size="icon"
        variant="outline"
      />
      <AudioPlayerTime />
      <AudioPlayerProgress className="flex-1" />
      <AudioPlayerDuration />
      <AudioPlayerSpeed />
    </div>
  );
}
