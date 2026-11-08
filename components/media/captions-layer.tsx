"use client";

import * as React from "react";
import { captionSizePref, type CaptionSize } from "@/lib/media/cinema";
import { cn } from "@/lib/utils";
import { usePlayer } from "./player-store";

// Subtitles drawn by the app (V57 as amended by T72): every text track stays
// `hidden`, so the browser loads its cues but paints nothing, and this layer
// shows the active cues as plain text. It rises above the controls while they
// are up (a native cue would sit under them, and `::cue` can't move it), and
// the owner's size pref sets how big it is.

/** Sized by the player's width (container units), with a floor for a small frame. */
const SIZE: Record<CaptionSize, string> = {
  s: "text-[length:max(13px,1.9cqw)]",
  m: "text-[length:max(15px,2.5cqw)]",
  l: "text-[length:max(18px,3.3cqw)]",
};

/** A cue's words as text: `getCueAsHTML` decodes entities into a detached fragment that is only read, never inserted. */
function cueText(cue: TextTrackCue): string {
  if (typeof VTTCue !== "undefined" && cue instanceof VTTCue) {
    return cue.getCueAsHTML().textContent;
  }
  const text = (cue as TextTrackCue & { text?: string }).text ?? "";
  return text.replace(/<[^>]*>/g, "");
}

function activeLines(track: TextTrack): string[] {
  const cues = track.activeCues;
  if (!cues) return [];
  const out: string[] = [];
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    if (!cue) continue;
    const text = cueText(cue).trim();
    if (text) out.push(text);
  }
  return out;
}

/** `lift`: the controls' height in px while they're up, or null while they're hidden. */
export function CaptionsLayer({ lift }: { lift: number | null }) {
  const track = usePlayer((s) => s.track);
  const size = captionSizePref.use();
  // The lines of the track they were read from: a switch of track never shows the old one's.
  const [shown, setShown] = React.useState<{ track: TextTrack; lines: string[] } | null>(null);

  React.useEffect(() => {
    if (!track) return;
    const read = () => {
      setShown({ track, lines: activeLines(track) });
    };
    track.addEventListener("cuechange", read);
    // Cues already showing (a seek, or a track switched on mid-cue) arrive on the next frame.
    const raf = requestAnimationFrame(read);
    return () => {
      cancelAnimationFrame(raf);
      track.removeEventListener("cuechange", read);
    };
  }, [track]);

  const lines = track && shown?.track === track ? shown.lines : [];
  if (lines.length === 0) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 z-10 flex justify-center px-[6%] transition-[bottom] duration-200 ease-out-quint"
      // Just above the controls while they're up (their measured height), else near the foot of the picture.
      style={{ bottom: lift === null ? "6%" : `${String(lift + 12)}px` }}
    >
      <p className={cn("max-w-[80%] rounded-lg bg-island/72 px-[0.6em] py-[0.2em] text-center leading-snug font-medium whitespace-pre-line text-island-foreground", SIZE[size])}>
        {lines.join("\n")}
      </p>
    </div>
  );
}
