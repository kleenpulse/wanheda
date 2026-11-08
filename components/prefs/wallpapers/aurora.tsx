"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useAnimationLoop } from "@/hooks/use-animation-loop";
import type { AuroraEdge } from "@/lib/prefs/prefs";
import { paint, unit, type WallpaperPalette } from "@/lib/prefs/wallpaper-palette";

// Ported from Motion Garden's horizon-aurora: smoky light hanging from the top
// edge of the sheet (or rising from the bottom one), drifting on its own and
// leaning toward the pointer.

const VERTEX = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

// Units are pane heights: y = 0 on the light's edge (the top, flipped, unless
// uFromBottom), x runs 0 to aspect.
const FRAGMENT = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uPointer;
uniform vec3 uCore;
uniform vec3 uHaze;
uniform float uReach;
uniform float uIntensity;
uniform float uFromBottom;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(17.3, 9.1); a *= 0.5; }
  return v;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  if (uFromBottom < 0.5) frag.y = uRes.y - frag.y;
  vec2 p = frag / uRes.y;
  float aspect = uRes.x / uRes.y;
  float cx = p.x - aspect * 0.5;
  float t = uTime;

  float d = p.y + cx * cx * (0.35 / aspect);

  float dx = uPointer.x - p.x;
  float near = uPointer.z * exp(-dx * dx * 1.6) * exp(-max(uPointer.y - 0.3 * uReach, 0.0) * 1.5);
  float lean = 0.3 * sin(t * 0.07 + cx * 1.3) + clamp(dx, -0.7, 0.7) * near * 2.4;

  vec2 q = vec2(cx - d * lean, d / uReach);
  vec2 warp = vec2(fbm(q * vec2(1.4, 2.2) + vec2(t * 0.04, -t * 0.07)),
                   fbm(q * vec2(1.4, 2.2) + vec2(5.2, 1.3) - t * 0.05));
  float body = fbm(vec2(q.x * 1.6 + warp.x * 1.2 + t * 0.03, q.y * 1.4 + warp.y * 0.8 - t * 0.06));
  float strands = fbm(vec2(q.x * 7.0 + warp.x * 2.5, q.y * 1.1 - t * 0.09));

  float reach = (0.06 + 0.24 * body * body + near * 0.3) * uReach;
  float density = exp(-max(d, 0.0) / reach) * (0.35 + 1.3 * strands * body) * (1.0 + 0.9 * near);
  density += exp(-max(d, 0.0) / 0.025) * 0.45;
  density *= 1.0 - smoothstep(0.45 * uReach, 0.95 * uReach, d);
  density *= uIntensity;

  float a = pow(clamp(density, 0.0, 1.0), 1.5);
  vec3 col = mix(uHaze, uCore, smoothstep(0.35, 0.95, density));
  gl_FragColor = vec4(col * a, a * 0.7);
}
`;

const mix = (a: readonly number[], b: readonly number[], t: number): [number, number, number] => [
  (a[0] ?? 0) + ((b[0] ?? 0) - (a[0] ?? 0)) * t,
  (a[1] ?? 0) + ((b[1] ?? 0) - (a[1] ?? 0)) * t,
  (a[2] ?? 0) + ((b[2] ?? 0) - (a[2] ?? 0)) * t,
];

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

export function Aurora({ palette, reduced, edge = "top" }: { palette: WallpaperPalette; reduced: boolean; edge?: AuroraEdge }) {
  const ref = useRef<HTMLDivElement>(null);
  const fallback = useRef<HTMLDivElement>(null);
  const draw = useRef<((dt: number) => void) | null>(null);
  const sized = useRef<((w: number, h: number) => void) | null>(null);

  // The core leans a third of the way to ink on glass (a pure ink core burns white behind
  // the cards); on paper it stays in the hue so it reads as light, not soot.
  // The edge rides along too, so flipping it changes the next frame, not the canvas.
  const live = useRef({ core: unit(palette.ink), haze: unit(palette.signal), intensity: 1, bottom: edge === "bottom" });
  useLayoutEffect(() => {
    live.current = {
      core: palette.dark ? mix(unit(palette.signal), unit(palette.ink), 0.35) : unit(palette.signal),
      haze: unit(palette.signal),
      intensity: palette.dark ? 0.55 : 0.5,
      bottom: edge === "bottom",
    };
  });

  const loop = useAnimationLoop({
    target: ref,
    halted: reduced,
    dpr: 1, // A soft field: device pixels would cost fill-rate for nothing.
    onResize: ({ bufferWidth, bufferHeight }) => sized.current?.(bufferWidth, bufferHeight),
    onFrame: ({ dt }) => {
      if (!draw.current) return false;
      draw.current(reduced ? 0 : dt);
    },
  });

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    // A fresh canvas per setup: Strict Mode's rerun must not inherit a context the cleanup lost.
    const canvas = document.createElement("canvas");
    canvas.className = "absolute inset-0 size-full";
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false });
    const vs = gl && compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = gl && compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl?.createProgram();
    if (gl && vs && fs && program) {
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
    }
    if (!gl || !program || !gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const still = fallback.current;
      still?.removeAttribute("hidden");
      return () => {
        still?.setAttribute("hidden", "");
      };
    }
    host.append(canvas);
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const at = (name: string) => gl.getUniformLocation(program, name);
    const uRes = at("uRes");
    const uTime = at("uTime");
    const uPointer = at("uPointer");
    const uCore = at("uCore");
    const uHaze = at("uHaze");
    const uReach = at("uReach");
    const uIntensity = at("uIntensity");
    const uFromBottom = at("uFromBottom");
    gl.uniform1f(uReach, 0.8);

    // Pointer in pane-height units, eased so the smoke drifts after it rather than snapping.
    const target = { x: 0, y: 0, pull: 0 };
    const eased = { x: 0, y: 0, pull: 0 };
    let time = 40; // Start mid-drift, not on the noise's tidy origin.

    // The backdrop takes no pointer events, so the pointer is read off the window.
    const onMove = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      if (!rect.height) return;
      const inside =
        e.pointerType !== "touch" &&
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      target.pull = inside ? 1 : 0;
      if (!inside) return;
      target.x = (e.clientX - rect.left) / rect.height;
      // Measured from the light's own edge, as the shader counts it.
      target.y = (live.current.bottom ? rect.bottom - e.clientY : e.clientY - rect.top) / rect.height;
      if (eased.pull < 0.01) Object.assign(eased, { x: target.x, y: target.y });
    };
    const onLeave = () => {
      target.pull = 0;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);

    sized.current = (w, h) => {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    };
    draw.current = (dt) => {
      const l = live.current;
      time += dt * 0.7;
      const k = Math.min(1, dt * 2.2);
      eased.x += (target.x - eased.x) * k;
      eased.y += (target.y - eased.y) * k;
      // Settles back slower than it gathers, so letting go reads as the smoke drifting home.
      const rate = target.pull > eased.pull ? 1.5 : 0.9;
      eased.pull += (target.pull - eased.pull) * Math.min(1, dt * rate);
      gl.uniform1f(uTime, time);
      gl.uniform3f(uPointer, eased.x, eased.y, eased.pull);
      gl.uniform3fv(uCore, l.core);
      gl.uniform3fv(uHaze, l.haze);
      gl.uniform1f(uIntensity, l.intensity);
      gl.uniform1f(uFromBottom, l.bottom ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    loop.resize();
    loop.start();

    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      draw.current = null;
      sized.current = null;
      canvas.remove();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [loop]);

  // A skin, accent or edge change repaints the still frame under reduced motion.
  useEffect(() => {
    loop.paint();
  }, [palette, edge, loop]);

  return (
    <div ref={ref} className="relative size-full overflow-hidden">
      <div
        ref={fallback}
        hidden
        className={edge === "bottom" ? "absolute inset-x-0 bottom-0 h-[70%]" : "absolute inset-x-0 top-0 h-[70%]"}
        style={{
          background: `radial-gradient(60% 100% at 50% ${edge === "bottom" ? "100%" : "0%"}, ${paint(palette.signal, 0.4)}, ${paint(palette.signal, 0.1)} 55%, transparent)`,
        }}
      />
    </div>
  );
}
