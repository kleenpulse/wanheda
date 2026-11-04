"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { type Metrics, useAnimationLoop } from "@/hooks/use-animation-loop";
import { paint, type WallpaperPalette } from "@/lib/prefs/wallpaper-palette";

// Ported from Motion Garden's starfield: three parallax layers drifting up and
// to the right, a twinkle, a few stars in the signal hue and the odd shooting
// star. On paper the stars are ink dust; on glass they are light.

const TWO_PI = Math.PI * 2;
const DRIFT_X = Math.cos(-0.45);
const DRIFT_Y = Math.sin(-0.45);
const LAYERS = 3;
const DENSITY = 0.75;
/** CSS px per second at the nearest layer. */
const DRIFT_SPEED = 9;
const TWINKLE = 0.5;
/** Shooting stars per second, on average. */
const SHOT_RATE = 0.12;
const SIGNAL_SHARE = 0.14;

interface Star {
  x: number;
  y: number;
  size: number;
  alpha: number;
  phase: number;
  depth: number;
  signal: boolean;
}

interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  len: number;
  alive: boolean;
}

export function Stars({ palette, reduced }: { palette: WallpaperPalette; reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draw = useRef<((dt: number) => void) | null>(null);
  const measure = useRef<((m: Metrics) => void) | null>(null);

  const live = useRef({ palette, reduced });
  useLayoutEffect(() => {
    live.current = { palette, reduced };
  });

  const loop = useAnimationLoop({
    target: ref,
    halted: reduced,
    dpr: "auto",
    resizeDebounceMs: 100,
    onResize: (m) => measure.current?.(m),
    onFrame: ({ dt }) => {
      if (!draw.current) return false;
      draw.current(dt);
    },
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let w = 0;
    let h = 0;
    let t = 0;
    let stars: Star[] = [];
    const shots: Shot[] = Array.from({ length: 3 }, () => ({ x: 0, y: 0, vx: 0, vy: 0, len: 0, alive: false }));

    const populate = () => {
      const total = Math.max(20, Math.min(500, Math.floor(((w * h) / 8000) * DENSITY)));
      stars = Array.from({ length: total }, (_, i) => {
        const depth = 0.3 + (0.7 * (i % LAYERS)) / (LAYERS - 1);
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          size: (Math.random() * 0.9 + 0.4) * (0.5 + depth),
          alpha: (Math.random() * 0.5 + 0.4) * (0.4 + depth * 0.6),
          phase: Math.random() * TWO_PI,
          depth,
          signal: Math.random() < SIGNAL_SHARE,
        };
      });
      for (const s of shots) s.alive = false;
    };

    measure.current = ({ width, height, dpr, bufferWidth, bufferHeight }) => {
      canvas.width = bufferWidth;
      canvas.height = bufferHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      w = width;
      h = height;
      populate();
    };

    const spawn = (s: Shot) => {
      const fromTop = Math.random() < 0.6;
      const speed = 420 + Math.random() * 360;
      const angle = 2.3 + Math.random() * 0.5; // Down and to the left.
      s.vx = Math.cos(angle) * speed;
      s.vy = Math.sin(angle) * speed;
      s.x = fromTop ? Math.random() * w : w + 20;
      s.y = fromTop ? -20 : Math.random() * h * 0.5;
      s.len = 80 + Math.random() * 120;
      s.alive = true;
    };

    draw.current = (dt) => {
      const { palette: p, reduced: still } = live.current;
      const base = p.dark ? p.ink : p.faint;
      // Glow only on glass, and only on the few signal stars: a blur per star is the expensive part.
      const glow = p.dark ? 6 : 0;
      ctx.clearRect(0, 0, w, h);

      t = (t + dt * 2.4) % TWO_PI;
      for (const st of stars) {
        if (!still) {
          const step = DRIFT_SPEED * (0.2 + st.depth) * dt;
          st.x = (st.x + DRIFT_X * step + w) % w;
          st.y = (st.y + DRIFT_Y * step + h) % h;
        }
        const twinkle = still ? 1 : 1 + Math.sin(t + st.phase) * TWINKLE;
        const alpha = Math.max(0, Math.min(1, st.alpha * twinkle * (p.dark ? 1 : 0.8)));
        const rgb = st.signal ? p.signal : base;
        ctx.beginPath();
        ctx.arc(st.x, st.y, Math.max(0.2, st.size), 0, TWO_PI);
        ctx.fillStyle = paint(rgb, alpha);
        if (st.signal && glow > 0) {
          ctx.shadowBlur = glow * st.depth;
          ctx.shadowColor = paint(rgb);
          ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          ctx.fill();
        }
      }

      if (still) return;
      if (Math.random() < SHOT_RATE * dt) {
        const free = shots.find((s) => !s.alive);
        if (free) spawn(free);
      }
      for (const s of shots) {
        if (!s.alive) continue;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const mag = Math.hypot(s.vx, s.vy) || 1;
        const tx = s.x - (s.vx / mag) * s.len;
        const ty = s.y - (s.vy / mag) * s.len;
        const trail = ctx.createLinearGradient(s.x, s.y, tx, ty);
        trail.addColorStop(0, paint(p.signal, 0.9));
        trail.addColorStop(1, paint(p.signal, 0));
        ctx.strokeStyle = trail;
        ctx.lineWidth = 1.5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        if (s.x < -s.len || s.x > w + s.len || s.y > h + s.len) s.alive = false;
      }
    };

    loop.resize();
    loop.start();

    return () => {
      draw.current = null;
      measure.current = null;
    };
  }, [loop]);

  useEffect(() => {
    loop.paint();
  }, [palette, loop]);

  return (
    <div ref={ref} className="relative size-full">
      <canvas ref={canvasRef} className="absolute inset-0 block size-full" />
    </div>
  );
}
