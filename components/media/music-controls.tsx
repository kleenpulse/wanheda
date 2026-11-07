"use client";

import { Repeat, Repeat1, Shuffle } from "lucide-react";
import { Chip, type ControlTone } from "@/components/speech/speech-controls";
import { useMusicPlayer } from "./music-player";

// Shuffle and repeat chips (T64), under the now-playing card in the player
// window. They act on the player store at once; the engine catches up.

const REPEAT_LABELS = { off: "Repeat is off", all: "Repeating the queue", one: "Repeating this track" } as const;

export function MusicModes({ tone }: { tone: ControlTone }) {
  const shuffle = useMusicPlayer((s) => s.shuffle);
  const repeat = useMusicPlayer((s) => s.repeat);
  const { setShuffle, cycleRepeat } = useMusicPlayer.getState();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Chip
        label={shuffle ? "Shuffle is on" : "Shuffle is off"}
        tone={tone}
        on={shuffle}
        onClick={() => {
          setShuffle(!shuffle);
        }}
      >
        <Shuffle aria-hidden />
        Shuffle
      </Chip>
      <Chip label={REPEAT_LABELS[repeat]} tone={tone} on={repeat !== "off"} onClick={cycleRepeat}>
        {repeat === "one" ? <Repeat1 aria-hidden /> : <Repeat aria-hidden />}
        {repeat === "one" ? "Repeat one" : "Repeat"}
      </Chip>
    </div>
  );
}
