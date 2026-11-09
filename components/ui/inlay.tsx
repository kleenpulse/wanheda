"use client";

import * as React from "react";
import { useAnimationLoop } from "@/hooks/use-animation-loop";
import type { Rgb } from "@/lib/prefs/wallpaper-palette";
import { cn } from "@/lib/utils";

/*
  Inlay, from Motion Garden's registry: a live material poured into real type.
  Ported from ogl to raw WebGL2 (the way the wallpapers draw), with the colours
  passed in as resolved token bytes instead of hex.

  The real text stays in the DOM, so it is selectable and read aloud once. Until
  the canvas has poured a full frame over it, the text wears a CSS gradient of
  the signal: the first paint (and a device without WebGL2) already shows the
  word. After the pour the gradient is dropped, so its edges cannot fringe the
  material's.

  The mask is rasterised from the text node's own computed font, on resize and
  after webfonts settle, never per frame: rasterised before the webfont lands,
  the fallback's letterforms would be baked in for good.
*/

const VERTEX = `#version 300 es
in vec2 position;
out vec2 vUv;
void main() { vUv = position * 0.5 + 0.5; gl_Position = vec4(position, 0.0, 1.0); }`;

// Molten only: the registry's other materials are not used here.
const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uMask;
uniform vec2  uResolution;
uniform float uTime;
uniform float uScale;
uniform float uSweep;
uniform float uGlow;
uniform float uGrain;
uniform float uWarp;
uniform float uBoost;
uniform vec2  uPointer;
uniform vec3  uA;
uniform vec3  uB;

float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.56);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}

vec3 molten(vec2 p, float t) {
  float v = fbm(p + vec2(t * 0.6, t * 0.2));
  float veins = smoothstep(0.42, 0.72, v);
  return mix(uA * 0.35, uB, veins) + uB * pow(veins, 3.0) * 0.6;
}

void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 p = vec2(uv.x * aspect, uv.y) * max(uScale, 0.05) * 3.0;

  float t = uTime * (1.0 + uBoost);
  vec2 warp = vec2(fbm(p + t * 0.2), fbm(p.yx + 4.1 - t * 0.15)) - 0.5;
  vec3 col = molten(p + warp * uWarp * 1.6, t);

  // The pour runs along the glyphs' own x, so it follows the letterforms.
  float pour = uSweep <= 0.001 ? 1.0 : smoothstep(0.0, 1.0, (uTime / max(uSweep, 0.02)) - uv.x * 0.9);
  col *= pour;

  float mask = texture(uMask, vec2(uv.x, 1.0 - uv.y)).a;

  // Bloom taps the mask, not the material: the glow belongs to the glyph edge.
  vec2 px = 1.0 / max(uResolution, vec2(1.0));
  float halo = 0.0;
  halo += texture(uMask, vec2(uv.x + px.x * 3.0, 1.0 - uv.y)).a;
  halo += texture(uMask, vec2(uv.x - px.x * 3.0, 1.0 - uv.y)).a;
  halo += texture(uMask, vec2(uv.x, 1.0 - uv.y + px.y * 3.0)).a;
  halo += texture(uMask, vec2(uv.x, 1.0 - uv.y - px.y * 3.0)).a;
  halo *= 0.25;

  col += (hash21(gl_FragCoord.xy) - 0.5) * uGrain * 0.35;
  col *= 1.0 + exp(-dot(uv - uPointer, uv - uPointer) * 18.0) * uBoost * 0.4;

  float alpha = clamp(mask + halo * uGlow * 0.55, 0.0, 1.0) * pour;
  fragColor = vec4(col * alpha, alpha);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

const unit = ([r, g, b]: Rgb): [number, number, number] => [r / 255, g / 255, b / 255];

export interface InlayProps {
  /** The line to fill. Stays a real text node underneath. */
  text: string;
  /** Base of the material, as resolved token bytes. */
  colorA: Rgb;
  /** The veins. */
  colorB: Rgb;
  flowSpeed?: number;
  /** Size of the material's features relative to the type. */
  scale?: number;
  /** Seconds for the material to pour across the line. Replays on every un-pause. */
  sweep?: number;
  /** Bloom past the glyph edge. */
  glow?: number;
  grain?: number;
  warp?: number;
  /** How much the material quickens under the pointer. */
  hoverBoost?: number;
  /** Halt the loop; the material sets. */
  paused?: boolean;
  /** The material holds still and is already poured. */
  reducedMotion?: boolean;
  className?: string;
}

export function Inlay({
  text,
  colorA,
  colorB,
  flowSpeed = 0.4,
  scale = 1.6,
  sweep = 0.8,
  glow = 0.4,
  grain = 0.15,
  warp = 0.25,
  hoverBoost = 0.6,
  paused = false,
  reducedMotion = false,
  className,
}: InlayProps) {
  const hostRef = React.useRef<HTMLSpanElement>(null);
  const textRef = React.useRef<HTMLSpanElement>(null);
  const draw = React.useRef<((dt: number) => void) | null>(null);
  const sized = React.useRef<((w: number, h: number, dpr: number) => void) | null>(null);
  const replay = React.useRef<(() => void) | null>(null);
  const pointer = React.useRef({ x: 0.5, y: 0.5, over: false });

  // Read by the frame, so a prop change reaches the next frame without a rebuild.
  const live = React.useRef({ text, colorA, colorB, flowSpeed, scale, sweep, glow, grain, warp, hoverBoost, reducedMotion });
  React.useLayoutEffect(() => {
    live.current = { text, colorA, colorB, flowSpeed, scale, sweep, glow, grain, warp, hoverBoost, reducedMotion };
  });

  const loop = useAnimationLoop({
    target: hostRef,
    halted: paused || reducedMotion,
    dpr: "auto",
    onResize: ({ width, height, dpr }) => sized.current?.(width, height, dpr),
    onFrame: ({ dt }) => {
      if (!draw.current) return false;
      draw.current(dt);
    },
  });

  React.useEffect(() => {
    const host = hostRef.current;
    const textNode = textRef.current;
    if (!host || !textNode) return;
    // A fresh canvas per setup: Strict Mode's rerun must not inherit a lost context.
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.className = "pointer-events-none absolute inset-0 size-full";
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false });
    const vs = gl && compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = gl && compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl?.createProgram();
    if (gl && vs && fs && program) {
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
    }
    // No WebGL2: the CSS gradient on the text stays, which is the whole fallback.
    if (!gl || !program || !gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    host.append(canvas);
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const mask = document.createElement("canvas");
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

    const at = (name: string) => gl.getUniformLocation(program, name);
    const u = {
      mask: at("uMask"),
      res: at("uResolution"),
      time: at("uTime"),
      scale: at("uScale"),
      sweep: at("uSweep"),
      glow: at("uGlow"),
      grain: at("uGrain"),
      warp: at("uWarp"),
      boost: at("uBoost"),
      pointer: at("uPointer"),
      a: at("uA"),
      b: at("uB"),
    };
    gl.uniform1i(u.mask, 0);

    let time = 0;
    let boost = 0;
    let poured = false;

    const rebuildMask = (w: number, h: number, dpr: number) => {
      const ctx = mask.getContext("2d");
      if (!ctx || w < 1 || h < 1) return;
      mask.width = Math.max(1, Math.round(w * dpr));
      mask.height = Math.max(1, Math.round(h * dpr));
      const cs = getComputedStyle(textNode);
      ctx.clearRect(0, 0, mask.width, mask.height);
      ctx.scale(dpr, dpr);
      // The node's computed font, so the mask cannot disagree with the text it stands in for.
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      ctx.letterSpacing = cs.letterSpacing;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "white"; // Only the alpha is sampled.
      ctx.fillText(live.current.text, w / 2, h / 2);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mask);
    };

    sized.current = (w, h, dpr) => {
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(u.res, canvas.width, canvas.height);
      rebuildMask(w, h, dpr);
    };

    draw.current = (dt) => {
      const l = live.current;
      time += dt * l.flowSpeed;
      const want = pointer.current.over ? l.hoverBoost : 0;
      boost += (want - boost) * Math.min(1, dt * 6);
      // Reduced motion never pours: a halted loop would hold the empty first frame.
      const sweepNow = l.reducedMotion ? 0 : l.sweep;
      gl.uniform1f(u.time, time);
      gl.uniform1f(u.scale, l.scale);
      gl.uniform1f(u.sweep, sweepNow);
      gl.uniform1f(u.glow, l.glow);
      gl.uniform1f(u.grain, l.grain);
      gl.uniform1f(u.warp, l.warp);
      gl.uniform1f(u.boost, boost);
      gl.uniform2f(u.pointer, pointer.current.x, pointer.current.y);
      gl.uniform3fv(u.a, unit(l.colorA));
      gl.uniform3fv(u.b, unit(l.colorB));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // The pour has reached the line's right end: drop the CSS stand-in under it.
      if (!poured && time >= sweepNow * 1.9) {
        poured = true;
        textNode.setAttribute("data-poured", "");
      }
    };

    replay.current = () => {
      time = 0;
    };

    loop.resize();
    loop.start();

    let disposed = false;
    void document.fonts.ready.then(() => {
      if (!disposed) loop.resize();
    });

    return () => {
      disposed = true;
      draw.current = null;
      sized.current = null;
      replay.current = null;
      textNode.removeAttribute("data-poured");
      canvas.remove();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [loop]);

  // Un-pausing pours the line again, from empty.
  const wasPaused = React.useRef(paused);
  React.useEffect(() => {
    if (wasPaused.current && !paused) replay.current?.();
    wasPaused.current = paused;
  }, [paused]);

  React.useEffect(() => {
    loop.resize();
  }, [text, loop]);

  // A skin, theme or accent change repaints the still frame while halted.
  React.useEffect(() => {
    loop.paint();
  }, [colorA, colorB, reducedMotion, loop]);

  const track = (e: React.PointerEvent<HTMLSpanElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    pointer.current = { x: (e.clientX - r.left) / r.width, y: 1 - (e.clientY - r.top) / r.height, over: true };
    if (!paused && !reducedMotion) loop.start();
  };
  const release = () => {
    pointer.current.over = false;
  };

  return (
    <span
      ref={hostRef}
      className={cn("relative inline-block", className)}
      onPointerMove={track}
      onPointerLeave={release}
      onPointerCancel={release}
    >
      {/* Transparent, never hidden: display:none would drop it from the
          accessibility tree and from find-in-page. */}
      <span
        ref={textRef}
        className="bg-linear-to-r from-signal to-signal-ink bg-clip-text text-transparent data-poured:bg-none"
      >
        {text}
      </span>
    </span>
  );
}
