"use client";

import * as React from "react";
import { playerClock } from "@/lib/media/cinema";
import { cn } from "@/lib/utils";
import { WHEEL_SEEK_S, useWheelSteps } from "@/hooks/use-wheel-steps";
import { seekElement, usePlayer } from "./player-store";

// The video's progress bar (T72, V65): signal fill, a buffered tint, a round
// head, and a bubble over the pointer with the time it would seek to and, for
// a file on this device, the frame there. Everything moving is written to the
// DOM from the element (a frame loop while it plays, events while it's
// paused): playing never commits React. A drag seeks on release.

const KEY_STEP_S = 5;
const PREVIEW_W = 168;

/** The end of the buffered range that holds `t` (0 if none). */
function bufferedEnd(el: HTMLVideoElement, t: number): number {
  const b = el.buffered;
  for (let i = 0; i < b.length; i++) {
    if (b.start(i) <= t + 0.5 && t <= b.end(i)) return b.end(i);
  }
  return 0;
}

const pct = (v: number) => `${String(Math.min(1, Math.max(0, v)) * 100)}%`;

/**
 * A second, hidden-from-layout `<video>` on the same object URL that seeks to
 * the hovered time: the bubble shows its frame. Native files on this device
 * only (a remux has no URL; a link would fetch the file again). Built on the
 * first hover, torn down when the element goes (before the URL is revoked).
 */
class FramePreview {
  private video: HTMLVideoElement | null = null;
  private busy = false;
  private next: number | null = null;

  constructor(
    private readonly el: HTMLVideoElement,
    private readonly box: React.RefObject<HTMLDivElement | null>,
  ) {}

  /** Seeks the preview to `t`; false when this source gets no preview. */
  at(t: number): boolean {
    const src = this.el.currentSrc;
    const box = this.box.current;
    if (!src.startsWith("blob:") || this.el.srcObject || !box) return false;
    if (!this.video) {
      const video = document.createElement("video");
      video.muted = true;
      video.preload = "auto";
      video.playsInline = true;
      video.src = src;
      video.className = "block size-full object-cover";
      box.append(video);
      video.addEventListener("seeked", () => {
        this.busy = false;
        if (this.next !== null) this.seek(this.next);
      });
      this.video = video;
      usePlayer.getState().onRelease(this.el, () => {
        this.teardown();
      });
    }
    // One seek in flight; the newest hover waits for it.
    if (this.busy) this.next = t;
    else this.seek(t);
    return true;
  }

  private seek(t: number): void {
    if (!this.video) return;
    this.next = null;
    this.busy = true;
    this.video.currentTime = t;
  }

  teardown(): void {
    const v = this.video;
    if (!v) return;
    this.video = null;
    v.removeAttribute("src");
    v.load();
    v.remove();
  }
}

function usePreview(el: HTMLVideoElement, box: React.RefObject<HTMLDivElement | null>) {
  const [preview] = React.useState(() => new FramePreview(el, box));
  React.useEffect(
    () => () => {
      preview.teardown();
    },
    [preview],
  );
  return preview;
}

export function VideoScrub({
  el,
  onToggle,
  onHold,
}: {
  el: HTMLVideoElement;
  /** Space on the bar plays or pauses, as on the picture. */
  onToggle: () => void;
  /** True while the bar is in hand (dragging or hovered): the controls stay up. */
  onHold: (held: boolean) => void;
}) {
  const bar = React.useRef<HTMLDivElement>(null);
  const fill = React.useRef<HTMLDivElement>(null);
  const buffered = React.useRef<HTMLDivElement>(null);
  const head = React.useRef<HTMLDivElement>(null);
  const bubble = React.useRef<HTMLDivElement>(null);
  const bubbleTime = React.useRef<HTMLSpanElement>(null);
  const previewBox = React.useRef<HTMLDivElement>(null);
  const clock = React.useRef<HTMLSpanElement>(null);
  const drag = React.useRef<number | null>(null);
  const [left, setLeft] = React.useState(false);
  const preview = usePreview(el, previewBox);

  const duration = () => (Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0);

  const paint = React.useCallback(
    (t: number) => {
      const d = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
      const at = d > 0 ? t / d : 0;
      if (fill.current) fill.current.style.width = pct(at);
      if (head.current) head.current.style.left = pct(at);
      if (buffered.current) buffered.current.style.width = pct(d > 0 ? bufferedEnd(el, el.currentTime) / d : 0);
      if (clock.current) clock.current.textContent = left ? playerClock(d - t, true) : `${playerClock(t)} / ${playerClock(d)}`;
      if (bar.current) {
        bar.current.setAttribute("aria-valuenow", String(Math.floor(t)));
        bar.current.setAttribute("aria-valuemax", String(Math.floor(d)));
        bar.current.setAttribute("aria-valuetext", `${playerClock(t)} of ${playerClock(d)}`);
      }
    },
    [el, left],
  );

  // While it plays: a frame loop. Paused: the element's own events.
  React.useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (drag.current === null) paint(el.currentTime);
      raf = el.paused ? 0 : requestAnimationFrame(tick);
    };
    const onPlay = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const once = () => {
      if (drag.current === null) paint(el.currentTime);
    };
    const events = ["seeked", "timeupdate", "durationchange", "progress", "pause", "loadedmetadata", "emptied"] as const;
    for (const e of events) el.addEventListener(e, once);
    el.addEventListener("play", onPlay);
    once();
    if (!el.paused) onPlay();
    return () => {
      cancelAnimationFrame(raf);
      for (const e of events) el.removeEventListener(e, once);
      el.removeEventListener("play", onPlay);
    };
  }, [el, paint]);

  const fraction = (clientX: number) => {
    const r = bar.current?.getBoundingClientRect();
    return r && r.width > 0 ? Math.min(1, Math.max(0, (clientX - r.left) / r.width)) : 0;
  };

  /** Moves the bubble over `f` (0..1) of the bar, with the time there and its frame. */
  const showBubble = (f: number) => {
    const d = duration();
    const b = bubble.current;
    if (!b || d <= 0) return;
    const t = f * d;
    const hasFrame = preview.at(t);
    b.dataset.open = "";
    if (hasFrame) b.dataset.frame = "";
    else delete b.dataset.frame;
    const w = bar.current?.getBoundingClientRect().width ?? 0;
    const half = (hasFrame ? PREVIEW_W : 56) / 2;
    b.style.left = `${String(Math.min(Math.max(f * w, half), Math.max(half, w - half)))}px`;
    if (bubbleTime.current) bubbleTime.current.textContent = playerClock(t);
  };
  const hideBubble = () => {
    if (bubble.current) delete bubble.current.dataset.open;
  };

  const seekTo = (t: number) => {
    const d = duration();
    if (d <= 0) return;
    seekElement(el, t);
    paint(el.currentTime);
  };
  // The wheel over the bar seeks, a notch at a time (every slider takes the wheel).
  useWheelSteps(bar, (steps) => {
    seekTo(Math.min(duration(), Math.max(0, el.currentTime + steps * WHEEL_SEEK_S)));
  });

  return (
    <div className="flex items-center gap-3">
      <div
        ref={bar}
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        // Set once here; paint() keeps now, max and text current without a render.
        aria-valuenow={0}
        className="group/scrub relative h-6 min-w-0 flex-1 cursor-pointer touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-island-foreground/70"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const f = fraction(e.clientX);
          drag.current = f * duration();
          paint(drag.current);
          showBubble(f);
          onHold(true);
        }}
        onPointerMove={(e) => {
          const f = fraction(e.clientX);
          if (drag.current !== null) {
            drag.current = f * duration();
            paint(drag.current);
          }
          showBubble(f);
        }}
        onPointerUp={() => {
          if (drag.current !== null) seekTo(drag.current);
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
          paint(el.currentTime);
        }}
        onPointerEnter={() => {
          onHold(true);
        }}
        onPointerLeave={() => {
          if (drag.current === null) {
            hideBubble();
            onHold(false);
          }
        }}
        onLostPointerCapture={() => {
          if (drag.current !== null) seekTo(drag.current);
          drag.current = null;
          hideBubble();
          onHold(false);
        }}
        onKeyDown={(e) => {
          const d = duration();
          const by: Record<string, number> = {
            ArrowLeft: -KEY_STEP_S,
            ArrowDown: -KEY_STEP_S,
            ArrowRight: KEY_STEP_S,
            ArrowUp: KEY_STEP_S,
            PageDown: -d / 10,
            PageUp: d / 10,
          };
          const step = by[e.key];
          if (step !== undefined) seekTo(el.currentTime + step);
          else if (e.key === "Home") seekTo(0);
          else if (e.key === "End") seekTo(d);
          else if (e.key === " " || e.key === "Enter") onToggle();
          else return;
          e.preventDefault();
        }}
      >
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-island-foreground/25 transition-[height] duration-150 group-hover/scrub:h-1.5">
          <div ref={buffered} className="absolute inset-y-0 left-0 rounded-full bg-island-foreground/30" />
          <div ref={fill} className="absolute inset-y-0 left-0 rounded-full bg-signal" />
        </div>
        <div
          ref={head}
          aria-hidden
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-signal shadow-[0_0_0_4px_color-mix(in_oklab,var(--signal)_30%,transparent)] transition-transform duration-150 group-hover/scrub:scale-100 group-focus-visible/scrub:scale-100 group-active/scrub:scale-100"
        />
        <div
          ref={bubble}
          aria-hidden
          className={cn(
            "group/bubble pointer-events-none absolute bottom-full mb-2 flex -translate-x-1/2 flex-col items-center gap-1.5 opacity-0 transition-opacity duration-100",
            "data-open:opacity-100",
          )}
        >
          <div
            ref={previewBox}
            className="hidden aspect-video overflow-hidden rounded-[10px] bg-island shadow-lift group-data-frame/bubble:block"
            style={{ width: PREVIEW_W }}
          />
          <span ref={bubbleTime} className="tabular rounded-full bg-island-foreground px-2 py-0.5 text-[12px] leading-none font-medium text-island" />
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          setLeft((v) => !v);
        }}
        aria-label={left ? "Show time played" : "Show time left"}
        className="tabular shrink-0 rounded-full px-1.5 py-0.5 text-[12.5px] font-medium text-island-foreground/85 outline-none hover:text-island-foreground focus-visible:ring-2 focus-visible:ring-island-foreground/70"
      >
        <span ref={clock} />
      </button>
    </div>
  );
}
