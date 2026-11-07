"use client";

import * as React from "react";
import { mix, useOnScreen } from "@/components/ui/liquid-tank";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { BRIGHTNESS_SCALE, glowPref, MOVEMENT_SCALE } from "@/lib/media/glow";
import { autoGain, bandEdges, bandLevels, newGain } from "@/lib/media/levels";
import { paint, resolveColors, type Rgb } from "@/lib/prefs/wallpaper-palette";
import { musicLevels } from "./music-player";

// The now-playing card's backdrop when a song has no art (user 2026-11-07, after
// Gemini Live's voice pill): black at the top, and a liquid of light in the
// signal hue rising from the bottom centre, kin to the liquid tank. The music
// drives it: the overall level lifts the surface and quickens its roll, the
// bass swells the centre and brightens the core. A CSS blur turns the surface
// into fog. It settles to a low glow on pause and stops asking for frames; it
// halts off screen (V17); reduced motion paints one still glow.

const TOKENS = ["var(--signal)", "var(--color-island-foreground)"];
const BINS = 32;
/** The surface's height at rest, and how much more the music adds, as parts of the card. */
const REST = 0.15;
const LIFT = 0.1;
/**
 * The highest the surface may reach, as a part of the box from the bottom: below
 * the scrub and its time labels (measured: they end ~36 % up the box). A peak
 * past it is pressed flat, softly, instead of washing over the white bar.
 */
const CEILING = 0.32;
/** Reduced motion: the still glow's stand-in level. */
const STILL = 0.3;

interface Colors {
  signal: Rgb;
  light: Rgb;
}

/** The signal and the island's ink, re-read when the skin, theme or accent changes. */
function useGlowColors(): Colors | null {
  const [colors, setColors] = React.useState<Colors | null>(null);
  React.useEffect(() => {
    const root = document.documentElement;
    const read = () => {
      const grey: Rgb = [128, 128, 128];
      const [signal = grey, light = grey] = resolveColors(TOKENS);
      setColors({ signal, light });
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["class", "style", "data-skin", "data-accent"] });
    return () => {
      observer.disconnect();
    };
  }, []);
  return colors;
}

/** Eases `from` toward `to` at `rate` per second, frame-rate independent. */
const ease = (from: number, to: number, dt: number, rate: number) => from + (to - from) * (1 - Math.exp(-dt * rate));

export function SoundGlow({ playing }: { playing: boolean }) {
  const reduced = useReducedMotion();
  const colors = useGlowColors();
  const boxRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const metrics = React.useRef<Metrics | null>(null);
  const onScreen = useOnScreen(boxRef);
  const state = React.useRef({ energy: 0, bass: 0, phase: 0 });
  const audio = React.useRef({ data: new Uint8Array(BINS), edges: bandEdges(BINS), gain: newGain() });
  const glow = glowPref.use();
  const live = React.useRef({ playing, colors, reduced, glow });
  React.useLayoutEffect(() => {
    live.current = { playing, colors, reduced, glow };
  });

  /** One frame. False once paused and settled: the loop stops until play. */
  const draw = (dt: number): boolean => {
    const ctx = canvasRef.current?.getContext("2d");
    const m = metrics.current;
    const { playing: on, colors: c, reduced: still, glow: g } = live.current;
    // Settings → Sound: how bright the light, how hard the music moves it.
    const lit = BRIGHTNESS_SCALE[g.brightness];
    const k = MOVEMENT_SCALE[g.movement];
    const alpha = (a: number) => Math.min(1, a * lit);
    if (!ctx || !m || !c) return false;
    const st = state.current;
    if (still) {
      st.energy = on ? STILL : 0;
      st.bass = on ? STILL : 0;
    } else {
      const a = audio.current;
      const levels = on && musicLevels(a.data) ? autoGain(a.gain, bandLevels(a.data, a.edges)) : [];
      const energy = levels.length > 0 ? levels.reduce((s, v) => s + v, 0) / levels.length : 0;
      const bass = levels[0] ?? 0;
      // Rises quickly, falls slowly: a beat lifts it, the fall reads as liquid settling.
      st.energy = ease(st.energy, energy, dt, energy > st.energy ? 9 : 2.5);
      st.bass = ease(st.bass, bass, dt, bass > st.bass ? 14 : 3.5);
      if (on) st.phase += dt * (0.8 + st.energy * 1.4 * k);
    }

    const { width: w, height: h, dpr } = m;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const level = h * (1 - (REST + st.energy * LIFT * k));
    const swell = h * (0.03 + st.bass * 0.07 * k);
    const roll = 3 + st.energy * 8 * k;
    const lid = h * (1 - CEILING);
    // A hump at the centre (where the sound "comes from") on two rolling sines,
    // squeezed to a fifth of whatever pokes above the lid.
    const surface = (x: number) => {
      const u = x / w - 0.5;
      const y = level - swell * Math.exp(-(u * u) / 0.05) + Math.sin(x * 0.018 + st.phase) * roll * 0.6 + Math.sin(x * 0.031 - st.phase * 1.4) * roll * 0.4;
      return y < lid ? lid - (lid - y) * 0.2 : y;
    };
    const crest = Math.max(level - swell - roll, lid - (lid - (level - swell - roll)) * 0.2);
    const line = new Path2D();
    line.moveTo(0, surface(0));
    for (let x = 4; x <= w + 4; x += 4) line.lineTo(x, surface(x));
    const liquid = new Path2D(line);
    liquid.lineTo(w, h);
    liquid.lineTo(0, h);
    liquid.closePath();

    // The body: the signal, deepening from the surface down (black above it).
    const body = ctx.createLinearGradient(0, crest, 0, h);
    body.addColorStop(0, paint(c.signal, alpha(0.55)));
    body.addColorStop(0.45, paint(c.signal, alpha(0.32)));
    body.addColorStop(1, paint(c.signal, alpha(0.5)));
    ctx.fillStyle = body;
    ctx.fill(liquid);

    // The core: a pool of light at the bottom centre that the bass brightens.
    const core = ctx.createRadialGradient(w / 2, h, 0, w / 2, h, w * 0.45);
    core.addColorStop(0, paint(mix(c.signal, c.light, 0.35), alpha(0.18 + st.bass * 0.32)));
    core.addColorStop(1, paint(c.signal, 0));
    ctx.fillStyle = core;
    ctx.fill(liquid);

    // The surface itself catches the light: under the blur, a bright rolling band.
    ctx.lineWidth = 6 + st.energy * 4 * k;
    ctx.strokeStyle = paint(mix(c.signal, c.light, 0.55), alpha(0.6 + st.energy * 0.4));
    ctx.stroke(line);

    return on || st.energy > 0.003 || st.bass > 0.003;
  };
  const drawRef = React.useRef(draw);
  React.useLayoutEffect(() => {
    drawRef.current = draw;
  });

  const loop = useAnimationLoop({
    target: boxRef,
    halted: reduced || !onScreen,
    onResize: (next) => {
      metrics.current = next;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = next.bufferWidth;
      canvas.height = next.bufferHeight;
    },
    onFrame: ({ dt }) => (drawRef.current(dt) ? undefined : false),
  });

  // A play (or a new skin) wakes the loop; with reduced motion, one still frame.
  React.useEffect(() => {
    if (reduced || !onScreen) loop.paint();
    else loop.start();
  }, [playing, colors, reduced, onScreen, glow, loop]);

  return (
    // Larger than the card on every side so the blur's soft edge falls outside it.
    <div ref={boxRef} aria-hidden className="pointer-events-none absolute -inset-6 -z-10 blur-md">
      <canvas ref={canvasRef} className="size-full" />
    </div>
  );
}
