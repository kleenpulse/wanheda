"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { type Metrics, useAnimationLoop } from "@/hooks/use-animation-loop";
import { paint, type WallpaperPalette } from "@/lib/prefs/wallpaper-palette";

// Ported from Motion Garden's dot-field (itself from React Bits, MIT): a grid
// of dots shading from the signal hue to faint ink, with a slow ambient swell.
// A moving pointer bulges the grid away from it and lights a soft glow; the
// field relaxes when the hand stops.

const TWO_PI = Math.PI * 2;
const RADIUS = 1.5;
const SPACING = 26;
const CURSOR_RADIUS = 420;
const BULGE = 60;
const GLOW_RADIUS = 180;
const WAVE = 2;

interface Dot {
  ax: number;
  ay: number;
  sx: number;
  sy: number;
}

export function Dots({ palette, reduced }: { palette: WallpaperPalette; reduced: boolean }) {
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
    const host = ref.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!host || !canvas || !ctx) return;

    let w = 0;
    let h = 0;
    let t = 0;
    let dots: Dot[] = [];
    let engagement = 0;
    const pointer = { x: -9999, y: -9999, prevX: -9999, prevY: -9999, speed: 0 };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const rect = host.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    measure.current = ({ width, height, dpr, bufferWidth, bufferHeight }) => {
      canvas.width = bufferWidth;
      canvas.height = bufferHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      w = width;
      h = height;
      const step = RADIUS + SPACING;
      const cols = Math.floor(w / step);
      const rows = Math.floor(h / step);
      const padX = (w % step) / 2 + step / 2;
      const padY = (h % step) / 2 + step / 2;
      dots = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const ax = padX + c * step;
          const ay = padY + r * step;
          dots.push({ ax, ay, sx: ax, sy: ay });
        }
      }
    };

    draw.current = (dt) => {
      const { palette: p, reduced: still } = live.current;
      t += dt;

      // Engagement follows pointer speed, so the bulge lives only while the hand moves.
      const moved = Math.hypot(pointer.x - pointer.prevX, pointer.y - pointer.prevY);
      pointer.prevX = pointer.x;
      pointer.prevY = pointer.y;
      const perFrame = dt > 0 ? moved * (1 / 60 / dt) : 0;
      pointer.speed += (Math.min(perFrame, 200) - pointer.speed) * 0.5;
      const want = still ? 0 : Math.min(pointer.speed / 5, 1);
      engagement += (want - engagement) * Math.min(1, dt * 3.6);
      if (engagement < 0.001) engagement = 0;

      ctx.clearRect(0, 0, w, h);

      if (engagement > 0.01) {
        const glow = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, GLOW_RADIUS);
        glow.addColorStop(0, paint(p.signal, (p.dark ? 0.22 : 0.14) * engagement));
        glow.addColorStop(1, paint(p.signal, 0));
        ctx.fillStyle = glow;
        ctx.fillRect(pointer.x - GLOW_RADIUS, pointer.y - GLOW_RADIUS, GLOW_RADIUS * 2, GLOW_RADIUS * 2);
      }

      const shade = ctx.createLinearGradient(0, 0, w, h);
      shade.addColorStop(0, paint(p.signal, p.dark ? 0.75 : 0.65));
      shade.addColorStop(1, paint(p.faint, p.dark ? 0.6 : 0.7));
      ctx.fillStyle = shade;

      const crSq = CURSOR_RADIUS * CURSOR_RADIUS;
      const rad = RADIUS / 2 + 0.25;
      const k = Math.min(1, dt * 9);
      ctx.beginPath();
      for (const d of dots) {
        const dx = pointer.x - d.ax;
        const dy = pointer.y - d.ay;
        const distSq = dx * dx + dy * dy;
        let tx = d.ax;
        let ty = d.ay;
        if (engagement > 0.01 && distSq < crSq) {
          const dist = Math.sqrt(distSq) || 1;
          const f = 1 - dist / CURSOR_RADIUS;
          const push = f * f * BULGE * engagement;
          tx -= (dx / dist) * push;
          ty -= (dy / dist) * push;
        }
        d.sx += (tx - d.sx) * k;
        d.sy += (ty - d.sy) * k;
        const x = still ? d.ax : d.sx + Math.cos(d.ay * 0.03 + t * 0.8) * WAVE * 0.5;
        const y = still ? d.ay : d.sy + Math.sin(d.ax * 0.03 + t * 1.1) * WAVE;
        ctx.moveTo(x + rad, y);
        ctx.arc(x, y, rad, 0, TWO_PI);
      }
      ctx.fill();
    };

    loop.resize();
    loop.start();

    return () => {
      window.removeEventListener("pointermove", onMove);
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
