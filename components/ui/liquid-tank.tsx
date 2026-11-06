"use client";

import * as React from "react";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { paint, resolveColors, type Rgb } from "@/lib/prefs/wallpaper-palette";
import { cn } from "@/lib/utils";

// The liquid tank (ported from deep-ellum's LiquidProgress; first used by the
// subscriptions billing-cycle card, now shared with the reader's pinned
// document). The liquid rises from the foot to `progress` on arrival and its
// surface rolls on two sine waves. The words split black and white along the
// moving surface, per pixel, as in caishen_landing's hero: one solid copy in
// ink, and one in the ink that reads on the liquid, clipped every frame to the
// same wave path the canvas fills. (Caishen's six blend layers fringe small
// text blue at the anti-aliased edges; the clip gives the same split in pure
// colours at any size.) A duo-tone: the signal hue over its soft tint. The
// loop halts off screen and in a hidden tab (V17); reduced motion draws the
// level in place. Colours come from the skin's tokens at runtime.

const TOKENS = ["var(--foreground)", "var(--signal)", "var(--sheet)"];

interface Colors {
  ink: Rgb;
  signal: Rgb;
  sheet: Rgb;
  dark: boolean;
}

/** Linear mix of two colours, t of the way from a to b. */
export const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** The tank's colours, re-read when the skin, theme or accent changes on <html>. */
function useTankColors(): Colors | null {
  const [colors, setColors] = React.useState<Colors | null>(null);
  React.useEffect(() => {
    const root = document.documentElement;
    const read = () => {
      const grey: Rgb = [128, 128, 128];
      const [ink = grey, signal = grey, sheet = grey] = resolveColors(TOKENS);
      setColors({ ink, signal, sheet, dark: root.classList.contains("dark") });
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

/** Whether the element is on screen: the waves only roll while it is. */
export function useOnScreen(ref: React.RefObject<HTMLElement | null>): boolean {
  const [on, setOn] = React.useState(true);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry) setOn(entry.isIntersecting);
    });
    io.observe(el);
    return () => {
      io.disconnect();
    };
  }, [ref]);
  return on;
}

export function LiquidTank({
  progress,
  className,
  fill = false,
  children,
  overlay,
  ...rest
}: Omit<React.HTMLAttributes<HTMLElement>, "children"> & {
  /** 0..1: how full. A display ratio, never money (V25). */
  progress: number;
  className?: string;
  /** Fill the parent's height. */
  fill?: boolean;
  /**
   * The words, drawn twice: `wet` false is the copy in ink (read out), `wet`
   * true the copy in the on-liquid colour (hidden from screen readers).
   */
  children: (wet: boolean) => React.ReactNode;
  /** Drawn above both copies (controls, badges). */
  overlay?: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  const colors = useTankColors();
  const containerRef = React.useRef<HTMLElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const metrics = React.useRef<Metrics | null>(null);
  /** The copy of the words in the on-liquid colour, clipped to the liquid each frame. */
  const wetRef = React.useRef<HTMLDivElement>(null);
  const onScreen = useOnScreen(containerRef);
  const state = React.useRef({ level: 0, phase: 0 });
  const live = React.useRef({ progress, colors, reduced });
  React.useLayoutEffect(() => {
    live.current = { progress, colors, reduced };
  });

  const draw = (dt: number) => {
    const ctx = canvasRef.current?.getContext("2d");
    const m = metrics.current;
    const { progress: target, colors: c, reduced: still } = live.current;
    if (!ctx || !m || !c) return;
    const st = state.current;
    // Rises toward the level (about 0.08 a frame at 60 fps), and the surface rolls.
    st.level = still ? target : st.level + (target - st.level) * (1 - Math.exp(-dt * 4.8));
    if (!still) st.phase += dt * 1.8;

    const { width: w, height: h, dpr } = m;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const wave = Math.min(12, Math.max(6, h * 0.05));
    const fillY = h * (1 - Math.max(0, Math.min(1, st.level)));
    // The signal as a duo-tone, lighter at the top-left, deeper at the bottom-right.
    // Light themes deepen it so white words on it reach 4.5:1; dark themes
    // lighten it so the dark inverse ink does.
    const light = c.dark ? mix(c.signal, c.ink, 0.3) : mix(c.signal, c.ink, 0.2);
    const deep = c.dark ? c.signal : mix(c.signal, c.ink, 0.4);
    const body = ctx.createLinearGradient(0, 0, w, h);
    body.addColorStop(0, paint(light));
    body.addColorStop(1, paint(deep));
    ctx.fillStyle = body;
    const surface = (x: number) => fillY + Math.sin(x * 0.02 + st.phase) * wave * 0.35 + Math.sin(x * 0.035 + st.phase * 1.3) * wave * 0.25;
    ctx.beginPath();
    ctx.moveTo(0, surface(0));
    for (let x = 4; x <= w + 4; x += 4) ctx.lineTo(x, surface(x));
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    // The same surface clips the on-liquid copy of the words (CSS px, same box as the canvas).
    const wet = wetRef.current;
    if (wet) {
      let d = `M0 ${surface(0).toFixed(1)}`;
      for (let x = 4; x <= w + 4; x += 4) d += ` L${String(x)} ${surface(x).toFixed(1)}`;
      wet.style.clipPath = `path("${d} L${String(w)} ${String(h)} L0 ${String(h)} Z")`;
    }

    const shine = c.dark ? c.ink : c.sheet;
    const gloss = ctx.createLinearGradient(0, 0, 0, h);
    gloss.addColorStop(0, paint(shine, 0.12));
    gloss.addColorStop(0.35, paint(shine, 0.06));
    gloss.addColorStop(1, paint(shine, 0));
    ctx.fillStyle = gloss;
    ctx.fillRect(0, 0, w, h);
  };
  const drawRef = React.useRef(draw);
  React.useLayoutEffect(() => {
    drawRef.current = draw;
  });

  const loop = useAnimationLoop({
    target: containerRef,
    // Rolls only on screen and with motion allowed; otherwise one frame per change.
    halted: reduced || !onScreen,
    onResize: (m) => {
      metrics.current = m;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = m.bufferWidth;
      canvas.height = m.bufferHeight;
    },
    onFrame: ({ dt }) => {
      drawRef.current(dt);
    },
  });

  React.useEffect(() => {
    loop.paint();
  }, [progress, colors, reduced, loop]);

  return (
    <section ref={containerRef} {...rest} className={cn("relative isolate min-w-0 overflow-hidden bg-signal-soft", fill && "h-full", className)}>
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 -z-10 size-full" />
      {/* The box fills the tank (no padding on the section), so the clip's px match the canvas's. */}
      <div className={cn("relative", fill && "h-full")}>
        <div className={cn("text-foreground", fill && "h-full")}>{children(false)}</div>
        <div ref={wetRef} aria-hidden className="absolute inset-0 text-inverse-foreground" style={{ clipPath: "inset(100% 0 0 0)" }}>
          {children(true)}
        </div>
      </div>
      {overlay}
    </section>
  );
}
