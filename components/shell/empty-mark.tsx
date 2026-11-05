"use client";

import * as React from "react";
import { motion, useReducedMotion, useSpring, useTransform, type MotionValue } from "motion/react";
import { FOLLOW_SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Shift a layer by `depth` per unit of pointer offset: the deeper, the further it travels. */
function useDepth(v: MotionValue<number>, depth: number) {
  return useTransform(v, (n) => n * depth);
}

/**
 * The empty-state art: Wanheda's mark inside two hairline rings, as parallax
 * layers that lean toward the pointer, the signal dot furthest, like the
 * island watching it. Ported from ellum-harness `AvatarStage`. Fine pointers
 * only; holds still under reduced motion (SPEC V15).
 */
export function EmptyMark({ className }: { className?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  // -1…1 on each axis: the pointer's direction from the mark, eased by distance.
  const x = useSpring(0, FOLLOW_SPRING);
  const y = useSpring(0, FOLLOW_SPRING);

  React.useEffect(() => {
    if (reduced || !window.matchMedia("(pointer: fine)").matches) return;
    const onMove = (e: PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const dist = Math.hypot(dx, dy) || 1;
      const reach = Math.min(dist / 320, 1);
      x.set((dx / dist) * reach);
      y.set((dy / dist) * reach);
    };
    const onLeave = () => {
      x.set(0);
      y.set(0);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, [reduced, x, y]);

  const outerX = useDepth(x, 3);
  const outerY = useDepth(y, 3);
  const innerX = useDepth(x, 6);
  const innerY = useDepth(y, 6);
  const markX = useDepth(x, 10);
  const markY = useDepth(y, 10);
  const tilt = useDepth(x, 6);
  // In the mark's 24-unit grid, on top of the disc's own travel.
  const dotX = useDepth(x, 1.5);
  const dotY = useDepth(y, 1.5);

  return (
    <span ref={ref} aria-hidden className={cn("relative grid size-28 place-items-center", className)}>
      <motion.span
        style={{ x: outerX, y: outerY }}
        className="absolute inset-0 rounded-full ring-1 ring-border dark:ring-glass-border"
      />
      <motion.span
        style={{ x: innerX, y: innerY }}
        className="absolute inset-4 rounded-full bg-signal-soft/40 ring-1 ring-border dark:ring-glass-border"
      />
      <motion.span
        style={{ x: markX, y: markY, rotate: tilt }}
        className={cn(
          "relative grid size-14 place-items-center rounded-full bg-inverse text-inverse-foreground",
          "dark:bg-transparent dark:text-signal dark:shadow-glow dark:ring-1 dark:ring-signal/60",
        )}
      >
        <svg viewBox="0 0 24 24" className="size-7" fill="none">
          <path
            d="M5 9.5 8.2 18 12 11.5 15.8 18 19 9.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <motion.circle style={{ x: dotX, y: dotY }} cx="12" cy="5.5" r="1.5" className="fill-signal" />
        </svg>
      </motion.span>
    </span>
  );
}
