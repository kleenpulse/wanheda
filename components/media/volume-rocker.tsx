"use client";

import * as React from "react";
import { Volume1, Volume2, VolumeX } from "lucide-react";
import type { DevicePref } from "@/hooks/device-pref";
import { useWheelSteps } from "@/hooks/use-wheel-steps";
import { WHEEL_STEP, type Volume } from "@/lib/media/volume";
import { Tip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// The volume rocker (T64), shared by music and read-aloud: mute, and a slider
// (drag, arrow keys, or the mouse wheel anywhere over it, a notch a step).
// What it turns is a `VolumeTarget`: a device pref and the actions that set it.

export interface VolumeTarget {
  pref: DevicePref<Volume>;
  /** What it turns, for the mute button's label: "music", "reading". */
  what: string;
  set: (level: number) => void;
  nudge: (by: number) => void;
  toggleMute: () => void;
}

export type RockerTone = "island" | "surface";

const TONES = {
  island: {
    button: "text-island-foreground/80 hover:bg-island-foreground/12 hover:text-island-foreground focus-visible:ring-island-foreground/70",
    ring: "has-focus-visible:ring-island-foreground/70",
    track: "bg-island-foreground/25",
    fill: "bg-island-foreground",
  },
  surface: {
    button: "text-ink-2 hover:bg-accent hover:text-foreground focus-visible:ring-ring",
    ring: "has-focus-visible:ring-ring",
    track: "bg-foreground/15",
    fill: "bg-foreground",
  },
} as const;

const VOLUME_ICONS = { off: VolumeX, low: Volume1, high: Volume2 } as const;

/** The mouse wheel anywhere over it turns it, a notch a step (owner rule: every slider takes the wheel). */
export function VolumeRocker({ target, tone = "island" }: { target: VolumeTarget; tone?: RockerTone }) {
  const v = target.pref.use();
  const level = v.muted ? 0 : v.level;
  const Icon = VOLUME_ICONS[level === 0 ? "off" : level < 0.5 ? "low" : "high"];
  const pct = `${String(level * 100)}%`;
  const t = TONES[tone];
  const rocker = React.useRef<HTMLDivElement>(null);
  useWheelSteps(rocker, (steps) => {
    target.nudge(steps * WHEEL_STEP);
  });

  return (
    <div ref={rocker} className="flex shrink-0 items-center gap-1">
      <Tip
        label={v.muted ? "Unmute" : "Mute"}
        render={
          <button
            type="button"
            aria-label={v.muted ? `Unmute ${target.what}` : `Mute ${target.what}`}
            onClick={target.toggleMute}
            className={cn("grid size-7 place-items-center rounded-full outline-none transition-[background-color,transform] duration-150 focus-visible:ring-2 active:scale-90", t.button)}
          />
        }
      >
        <Icon aria-hidden className="size-4" />
      </Tip>
      <div className={cn("relative h-5 w-20 rounded-full has-focus-visible:ring-2", t.ring)}>
        <div className={cn("absolute inset-x-0 top-1/2 h-0.75 -translate-y-1/2 overflow-hidden rounded-full", t.track)}>
          <div className={cn("h-full rounded-full", t.fill)} style={{ width: pct }} />
        </div>
        <div aria-hidden className={cn("absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full", t.fill)} style={{ left: pct }} />
        <input
          type="range"
          aria-label={`${target.what.charAt(0).toUpperCase()}${target.what.slice(1)} volume`}
          aria-valuetext={v.muted ? "Muted" : `${String(Math.round(level * 100))}%`}
          min={0}
          max={100}
          step={5}
          value={Math.round(level * 100)}
          onChange={(e) => {
            target.set(Number(e.currentTarget.value) / 100);
          }}
          className="absolute inset-0 w-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  );
}
