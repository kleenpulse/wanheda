"use client";

import * as React from "react";
import { wheelSteps } from "@/lib/media/volume";

// The mouse wheel tunes a slider (owner rule, 2026-11-08: every range slider
// takes the wheel, never turned off). One notch is one step; a trackpad's small
// deltas add up to one. Up is more (louder, later, faster).

/** Seconds one wheel notch seeks on a seek bar (music and video). */
export const WHEEL_SEEK_S = 5;

/** A wheel this soon after any scroll belongs to that scroll, not to the slider. */
const SCROLL_GLIDE_MS = 300;

/**
 * Calls `onSteps(n)` for each whole notch turned over `ref`'s element, and keeps
 * the page behind from scrolling. React's onWheel is passive, so this is a
 * native listener. A page scroll that's already moving glides over the slider
 * instead of stopping on it; Ctrl+wheel (zoom) and sideways swipes pass through.
 */
export function useWheelSteps(ref: React.RefObject<HTMLElement | null>, onSteps: (steps: number) => void): void {
  const turn = React.useEffectEvent(onSteps);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let carry = 0;
    let lastScroll = -Infinity;
    const onScroll = () => {
      lastScroll = performance.now();
    };
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (performance.now() - lastScroll < SCROLL_GLIDE_MS) return;
      e.preventDefault();
      const turned = wheelSteps(carry, e.deltaY, e.deltaMode);
      carry = turned.carry;
      if (turned.steps !== 0) turn(turned.steps);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    // Scroll doesn't bubble; capturing on window hears every scroller's.
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [ref]);
}
