"use client";

import { motion, useReducedMotion } from "motion/react";
import { Clapperboard, Music, type LucideProps } from "lucide-react";
import { ICON_MORPH } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useMusicPlayer } from "./music-player";

// The Media app's icon: the clapperboard, morphing into a note while the
// player holds a song (playing or paused), and back when it stops. Both glyphs
// sit in one cell; the outgoing one shrinks, turns and blurs away as the other
// grows in. Reduced motion keeps only the crossfade.

const SHOWN = { opacity: 1, scale: 1, rotate: 0, filter: "blur(0px)" };
const GONE = { opacity: 0, scale: 0.4, rotate: -60, filter: "blur(4px)" };

export function MediaIcon({ className, ...props }: LucideProps) {
  const music = useMusicPlayer((s) => s.status !== "idle");
  const reduced = Boolean(useReducedMotion());
  const state = (on: boolean) => (reduced ? { opacity: on ? 1 : 0 } : on ? SHOWN : GONE);
  return (
    <span aria-hidden className={cn("inline-grid place-items-center", className)}>
      <motion.span className="col-start-1 row-start-1 grid place-items-center" initial={false} animate={state(!music)} transition={ICON_MORPH}>
        <Clapperboard {...props} />
      </motion.span>
      <motion.span className="col-start-1 row-start-1 grid place-items-center" initial={false} animate={state(music)} transition={ICON_MORPH}>
        <Music {...props} />
      </motion.span>
    </span>
  );
}
