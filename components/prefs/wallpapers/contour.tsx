"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { type Metrics, useAnimationLoop } from "@/hooks/use-animation-loop";
import { paint, type WallpaperPalette } from "@/lib/prefs/wallpaper-palette";

// Ported from Motion Garden's contour: a topographic map of a drifting height
// field. Marching squares finds the iso lines on a coarse grid each frame;
// every fifth line (by altitude, so the emphasis stays on its ring) is drawn
// in the signal hue. The pointer raises a hill under it.

const NOISE_SCALE = 0.0034;
const DRIFT = 0.055;
const SPEED = 0.5;
const LEVELS = 22;
const CELL = 14;
const WARP = 0.35;
const CURSOR_RADIUS = 180;
const CURSOR_STRENGTH = 0.5;
const INDEX_EVERY = 5;
/** Caps the grid on an ultrawide sheet: the cell grows instead of the cost. */
const MAX_CELLS = 200;
/** The drift is slow; 30 frames a second is plenty and halves the work. */
const FRAME_STEP = 1 / 30;

/** Fixed seed, so the server and every client draw the same terrain. */
const PERM = (() => {
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i++) base[i] = i;
  let s = 1337 >>> 0;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = base[i] ?? 0;
    base[i] = base[j] ?? 0;
    base[j] = t;
  }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = base[i & 255] ?? 0;
  return p;
})();

const lattice = (xi: number, yi: number) => (PERM[((PERM[xi & 255] ?? 0) + (yi & 255)) & 511] ?? 0) / 255;
const fade = (t: number) => t * t * (3 - 2 * t);

function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = fade(x - xi);
  const v = fade(y - yi);
  const a = lattice(xi, yi);
  const b = lattice(xi + 1, yi);
  const c = lattice(xi, yi + 1);
  const d = lattice(xi + 1, yi + 1);
  const top = a + (b - a) * u;
  return top + (c + (d - c) * u - top) * v;
}

function fbm(x: number, y: number): number {
  return (valueNoise(x, y) * 0.5 + valueNoise(x * 2, y * 2) * 0.25 + valueNoise(x * 4, y * 4) * 0.125) / 0.875;
}

export function Contour({ palette, reduced }: { palette: WallpaperPalette; reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draw = useRef<((dt: number) => void) | null>(null);
  const measure = useRef<((m: Metrics) => void) | null>(null);

  const live = useRef({ line: "", index: "", reduced });
  useLayoutEffect(() => {
    live.current = {
      line: paint(palette.faint, palette.dark ? 0.5 : 0.55),
      index: paint(palette.signal, palette.dark ? 0.6 : 0.5),
      reduced,
    };
  });

  const loop = useAnimationLoop({
    target: ref,
    halted: reduced,
    dpr: "auto",
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

    let field = new Float32Array(0);
    let gw = 0;
    let gh = 0;
    let cs = CELL;
    let w = 0;
    let h = 0;
    let ox = 0;
    let oy = 0;
    let px = 0;
    let py = 0;
    let influence = 0;
    let pending = FRAME_STEP; // Draw on the first frame.
    const pointer = { x: 0, y: 0, inside: false };

    const onMove = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.inside =
        e.pointerType !== "touch" && pointer.x >= 0 && pointer.y >= 0 && pointer.x <= rect.width && pointer.y <= rect.height;
    };
    const onLeave = () => {
      pointer.inside = false;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);

    measure.current = ({ width, height, dpr, bufferWidth, bufferHeight }) => {
      if (width < 1 || height < 1) return;
      canvas.width = bufferWidth;
      canvas.height = bufferHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cs = Math.max(CELL, width / MAX_CELLS, height / MAX_CELLS);
      gw = Math.max(2, Math.ceil(width / cs));
      gh = Math.max(2, Math.ceil(height / cs));
      w = width;
      h = height;
      const need = (gw + 1) * (gh + 1);
      if (field.length !== need) field = new Float32Array(need);
      if (!pointer.inside) {
        px = width / 2;
        py = height / 2;
      }
      pending = FRAME_STEP;
    };

    draw.current = (frameDt) => {
      const l = live.current;
      pending += frameDt;
      // A halted repaint (reduced motion, a skin change) arrives with dt 0 and must still draw.
      if (gw < 2 || (pending < FRAME_STEP && !l.reduced)) return;
      const dt = Math.min(pending, 0.1);
      pending = 0;

      // Reduced against the lattice period, so the drift is seamless forever.
      ox = (ox + dt * SPEED * DRIFT) % 256;
      oy = (oy + dt * SPEED * DRIFT * 0.62) % 256;

      const ease = (rate: number) => 1 - Math.exp(-dt * rate);
      px += (pointer.x - px) * ease(9);
      py += (pointer.y - py) * ease(9);
      influence += ((pointer.inside && !l.reduced ? 1 : 0) - influence) * ease(4);

      const bump = CURSOR_STRENGTH * influence;
      const sigma = CURSOR_RADIUS * 0.5;
      const inv2s2 = 1 / (2 * sigma * sigma);
      const warp = WARP * 1.6;
      let min = Infinity;
      let max = -Infinity;

      for (let j = 0; j <= gh; j++) {
        const y = j * cs;
        const ny = y * NOISE_SCALE + oy;
        const row = j * (gw + 1);
        for (let i = 0; i <= gw; i++) {
          const x = i * cs;
          const nx = x * NOISE_SCALE + ox;
          const sx = nx + (valueNoise(nx * 1.7 + 11.3, ny * 1.7) - 0.5) * warp;
          const sy = ny + (valueNoise(nx * 1.7, ny * 1.7 + 5.7) - 0.5) * warp;
          let v = fbm(sx, sy);
          if (bump !== 0) {
            const dx = x - px;
            const dy = y - py;
            v += bump * Math.exp(-(dx * dx + dy * dy) * inv2s2);
          }
          field[row + i] = v;
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }

      ctx.clearRect(0, 0, w, h);

      const interval = 1 / LEVELS;
      const first = Math.ceil(min / interval);
      const last = Math.floor(max / interval);
      const regular = new Path2D();
      const indexed = new Path2D();

      for (let k = first; k <= last; k++) {
        const iso = k * interval;
        const path = Math.abs(k) % INDEX_EVERY === 0 ? indexed : regular;
        const seg = (ax: number, ay: number, bx: number, by: number) => {
          path.moveTo(ax, ay);
          path.lineTo(bx, by);
        };

        for (let j = 0; j < gh; j++) {
          const top = j * (gw + 1);
          const bot = top + gw + 1;
          const y0 = j * cs;
          const y1 = y0 + cs;
          for (let i = 0; i < gw; i++) {
            const a = field[top + i] ?? 0;
            const b = field[top + i + 1] ?? 0;
            const c = field[bot + i + 1] ?? 0;
            const d = field[bot + i] ?? 0;
            let code = 0;
            if (a >= iso) code |= 1;
            if (b >= iso) code |= 2;
            if (c >= iso) code |= 4;
            if (d >= iso) code |= 8;
            if (code === 0 || code === 15) continue;

            const x0 = i * cs;
            const x1 = x0 + cs;
            const tx = x0 + (cs * (iso - a)) / (b - a);
            const rx = y0 + (cs * (iso - b)) / (c - b);
            const bx = x0 + (cs * (iso - d)) / (c - d);
            const lx = y0 + (cs * (iso - a)) / (d - a);

            switch (code) {
              case 1:
              case 14:
                seg(x0, lx, tx, y0);
                break;
              case 2:
              case 13:
                seg(tx, y0, x1, rx);
                break;
              case 3:
              case 12:
                seg(x0, lx, x1, rx);
                break;
              case 4:
              case 11:
                seg(x1, rx, bx, y1);
                break;
              case 6:
              case 9:
                seg(tx, y0, bx, y1);
                break;
              case 7:
              case 8:
                seg(x0, lx, bx, y1);
                break;
              // Saddles: the centre value decides which pair of crossings joins.
              case 5:
              case 10: {
                const high = (a + b + c + d) * 0.25 >= iso;
                if (high === (code === 5)) {
                  seg(x0, lx, bx, y1);
                  seg(tx, y0, x1, rx);
                } else {
                  seg(x0, lx, tx, y0);
                  seg(x1, rx, bx, y1);
                }
                break;
              }
            }
          }
        }
      }

      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = l.line;
      ctx.lineWidth = 1;
      ctx.stroke(regular);
      ctx.strokeStyle = l.index;
      ctx.lineWidth = 1.5;
      ctx.stroke(indexed);
    };

    loop.resize();
    loop.start();

    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
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
