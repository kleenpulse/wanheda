"use client";

import * as React from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

// One row of text. If it doesn't fit, it slides by once, then rests at the
// start for REST_S and goes again, instead of wrapping (after Aventine's
// MarqueeText, user 2026-11-06). Only an edge with text running past it is
// faded: the right one at rest, the left one too while it slides. Spans only,
// so it can sit inside a button. With reduced motion it stays still and ends
// in an ellipsis. The second copy is hidden from screen readers.

/** Seconds of rest at the start between passes (user 2026-11-06: once every 5 s). */
const REST_S = 5;
/** How wide the left fade grows while the text slides. */
const FADE = "8%";

export function MarqueeText({
  text,
  className,
  /** Pixels per second, steady through the pass (user 2026-11-06: linear). */
  speed = 45,
  /** Space between the end of the text and its next copy, in px. */
  gap = 40,
}: {
  text: string;
  className?: string;
  speed?: number;
  gap?: number;
}) {
  const box = React.useRef<HTMLSpanElement>(null);
  const probe = React.useRef<HTMLSpanElement>(null);
  const mask = React.useRef<HTMLSpanElement>(null);
  const track = React.useRef<HTMLSpanElement>(null);
  const [cycle, setCycle] = React.useState(0);
  const reduced = useReducedMotion();

  React.useLayoutEffect(() => {
    const outer = box.current;
    const inner = probe.current;
    if (!outer || !inner) return;
    const measure = () => {
      const over = inner.scrollWidth - outer.clientWidth > 1;
      setCycle(over ? inner.scrollWidth + gap : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    return () => {
      ro.disconnect();
    };
  }, [text, gap]);

  const moving = cycle > 0 && !reduced;

  // Keyframes per title: the pass takes as long as its length needs, the rest is always REST_S, so the split is computed here.
  React.useEffect(() => {
    const m = mask.current;
    const t = track.current;
    if (!moving || !m || !t) return;
    const pass = cycle / speed;
    const total = (pass + REST_S) * 1000;
    const rest = REST_S / (pass + REST_S);
    const edge = Math.min(0.08, (1 - rest) / 4);
    const timing: KeyframeAnimationOptions = { duration: total, iterations: Infinity, easing: "linear" };
    // Two copies a cycle apart: at -50% the second sits exactly where the first began, so the loop doesn't show.
    const slide = t.animate(
      [
        { transform: "translateX(0)", offset: 0 },
        { transform: "translateX(0)", offset: rest },
        { transform: "translateX(-50%)", offset: 1 },
      ],
      timing,
    );
    const fade = m.animate(
      [
        { "--marquee-fade": "0%", offset: 0 },
        { "--marquee-fade": "0%", offset: rest },
        { "--marquee-fade": FADE, offset: rest + edge },
        { "--marquee-fade": FADE, offset: 1 - edge },
        { "--marquee-fade": "0%", offset: 1 },
      ],
      timing,
    );
    return () => {
      slide.cancel();
      fade.cancel();
    };
  }, [moving, cycle, speed]);

  return (
    <span ref={box} className={cn("relative block min-w-0 overflow-hidden", className)}>
      {/* Measures the text's natural one-row width. */}
      <span ref={probe} aria-hidden className="pointer-events-none invisible absolute top-0 left-0 whitespace-nowrap">
        {text}
      </span>
      {moving ? (
        <span ref={mask} className="marquee-mask block">
          <span ref={track} className="flex w-max whitespace-nowrap will-change-transform">
            <span>{text}</span>
            <span aria-hidden className="shrink-0" style={{ width: gap }} />
            <span aria-hidden>{text}</span>
            <span aria-hidden className="shrink-0" style={{ width: gap }} />
          </span>
        </span>
      ) : (
        <span className="block truncate">{text}</span>
      )}
    </span>
  );
}
