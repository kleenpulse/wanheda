"use client";

import { useEffect, useRef, useState } from "react";
import { Geometry, Mesh, Program, Renderer, RenderTarget, Texture, Triangle } from "ogl";
import { type Metrics, useAnimationLoop } from "@/hooks/use-animation-loop";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { type AuthWord, WORD_LIST, WORDS } from "@/lib/auth/auth-word";
import { resolveColors, unit } from "@/lib/prefs/wallpaper-palette";

// The sign-in swarm (V82): Motion Garden's Swarm, cut down to a still word.
//
// Kept from the registry: position and velocity live in float textures and
// never come back to the CPU; targets are sampled out of an offscreen 2D
// canvas; the spring tops its damping up to critical so a morph settles clean.
//
// Cut: curl turbulence, pointer repel, spin, orbit and the shape cycle. The
// owner wants a word that only moves while it changes. With nothing stirring
// it, the springs settle and the loop halts.

/**
 * Width / height of the band. Fixed, so the box has its real height before
 * the font loads, and so clip-space targets stay valid through any resize
 * (a resize repaints, it never resamples). Measured from Figtree 800: the
 * widest word's ink width over the deepest ascent + descent of all four
 * (7.01), so the ink runs edge to edge with no slack (owner 2026-11-09).
 */
const WORD_ASPECT = 7;
/** No margin: the word touches the band's edges, and the band the page's. */
const INSET = 0;
/** The sampler's fixed resolution, independent of the band's size. */
const SAMPLE_W = 1024;
const SAMPLE_H = Math.round(SAMPLE_W / WORD_ASPECT);
/** Font size of the no-WebGL fallback, in `cqi` of the box (WANHEDA's ink is 5.19 em wide). */
const FALLBACK_CQI = 19;

/**
 * Sim seconds a morph gets before the snap. The slowest particle (stagger
 * gain mix(1, 0.25, stagger): 0.66 on the entrance, 0.78 on a hover) has a
 * time constant under 0.8 s at these springs, so 5 s leaves well under a
 * pixel for the snap to close.
 */
const SETTLE_SECONDS = 5;
/** The sim never takes a bigger step than this, however long the frame. */
const MAX_STEP = 1 / 30;
/** The entrance: the registry's pace, an unhurried assembly out of the scatter. */
const INTRO = { morph: 1.1, stagger: 0.45 };
/**
 * A hover morph: a stiffer spring (the damping top-up keeps it critical, so
 * no overshoot) and a tighter stagger. Most of the word lands in about 1.1 s
 * instead of 1.5 s (owner 2026-11-09: "reduce the morph duration a bit").
 */
const HOVER = { morph: 2, stagger: 0.3 };
const DAMPING = 0.9;

/** Overdraw target for the alpha gain: about this many full sprites per inked pixel. */
const GAIN_K = 1.4;
const GAIN_MIN = 0.12;

/** Particle-grid side by band width: 16k, 33k, 65k particles. */
function sideFor(width: number): number {
  if (width < 640) return 128;
  if (width < 1100) return 181;
  return 256;
}

/** Sprite diameter in CSS px. */
function spriteFor(width: number): number {
  return Math.min(2, Math.max(1.1, width / 880));
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// --- Sampling ---------------------------------------------------------------

interface Layout {
  font: string;
  /** Shared alphabetic baseline, in sampler px. */
  baseline: number;
}

interface Sample {
  positions: Float32Array;
  /** Share of the sampler's pixels the word inks. */
  litFraction: number;
}


/**
 * One font size and one baseline for every word. The size makes the widest
 * word fit the inset width (or the tallest fit the height); the baseline
 * centres the deepest ascent and descent of all of them, so an overshooting O
 * never shifts a word up or down between morphs.
 */
function measureLayout(ctx: CanvasRenderingContext2D, family: string): Layout {
  const probe = 100;
  ctx.font = `800 ${probe}px ${family}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  let width = 0;
  let ascent = 0;
  let descent = 0;
  for (const word of WORD_LIST) {
    const m = ctx.measureText(word);
    width = Math.max(width, m.actualBoundingBoxLeft + m.actualBoundingBoxRight);
    ascent = Math.max(ascent, m.actualBoundingBoxAscent);
    descent = Math.max(descent, m.actualBoundingBoxDescent);
  }
  const scale = Math.min(
    (SAMPLE_W * (1 - 2 * INSET)) / Math.max(width, 1),
    (SAMPLE_H * (1 - 2 * INSET)) / Math.max(ascent + descent, 1),
  );
  const ink = (ascent + descent) * scale;
  return { font: `800 ${probe * scale}px ${family}`, baseline: (SAMPLE_H - ink) / 2 + ascent * scale };
}

/**
 * Samples words for one renderer build: the layout is measured once and each
 * word's targets are kept, so hovering back and forth never resamples. Owned
 * by the build and dropped with it, so a stale layout (measured while the
 * font was still missing) or ~1 MB of targets per word never outlives the page.
 */
function createSampler(family: string, count: number): (text: string) => Sample {
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_W;
  canvas.height = SAMPLE_H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const layout = ctx ? measureLayout(ctx, family) : null;
  const cache = new Map<string, Sample>();
  return (text) => {
    const cached = cache.get(text);
    if (cached) return cached;
    const sample = ctx && layout ? sampleWord(ctx, layout, text, count) : { positions: new Float32Array(count * 4), litFraction: 0 };
    cache.set(text, sample);
    return sample;
  };
}

/** The word's inked pixels as clip-space targets, one texel per particle. */
function sampleWord(ctx: CanvasRenderingContext2D, layout: Layout, text: string, count: number): Sample {
  const positions = new Float32Array(count * 4);
  ctx.clearRect(0, 0, SAMPLE_W, SAMPLE_H);
  ctx.font = layout.font;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const m = ctx.measureText(text);
  const x = (SAMPLE_W - (m.actualBoundingBoxLeft + m.actualBoundingBoxRight)) / 2 + m.actualBoundingBoxLeft;
  ctx.fillText(text, x, layout.baseline);

  const data = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
  const area = SAMPLE_W * SAMPLE_H;
  const lit = new Int32Array(area);
  let n = 0;
  // Column-major (x, then y), so particle i holds the same left-to-right slice
  // of ink in every word. A morph then reshapes each letter where it stands
  // (owner 2026-11-09: keep this look). Row-major made every particle keep its
  // row and cross the whole word sideways, which smeared a morph into
  // horizontal streaks.
  for (let x = 0; x < SAMPLE_W; x++) {
    for (let y = 0; y < SAMPLE_H; y++) {
      const p = y * SAMPLE_W + x;
      if ((data[p * 4 + 3] ?? 0) > 128) lit[n++] = p;
    }
  }

  for (let i = 0; i < count; i++) {
    const i4 = i * 4;
    positions[i4 + 3] = 1;
    if (n === 0) continue;
    // Stratified: particle i takes the i-th slice of the lit pixels, so the
    // whole word is covered evenly whether there are more pixels than
    // particles or fewer. A modulo pick would only fill the first columns.
    const j = Math.min(n - 1, Math.floor(((i + Math.random()) * n) / count));
    const p = lit[j] ?? 0;
    const px = p % SAMPLE_W;
    const py = (p - px) / SAMPLE_W;
    // Jitter inside the pixel so the cloud does not band onto the raster grid.
    positions[i4] = ((px + Math.random()) / SAMPLE_W) * 2 - 1;
    positions[i4 + 1] = 1 - ((py + Math.random()) / SAMPLE_H) * 2;
  }

  return { positions, litFraction: n / area };
}

/** The entrance's starting cloud: inside the box, so nothing is clipped on the way in. */
function scatter(count: number): Float32Array {
  const out = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    out[i * 4] = Math.random() * 2 - 1;
    out[i * 4 + 1] = Math.random() * 2 - 1;
    out[i * 4 + 3] = 1;
  }
  return out;
}

// --- Shaders ----------------------------------------------------------------

const quadVert = `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }`;

const copyFrag = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uSrc;
void main() { fragColor = texture(uSrc, vUv); }`;

const velFrag = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uPos;
uniform sampler2D uVel;
uniform sampler2D uTarget;
uniform float uDt;
uniform float uMorph;
uniform float uStagger;
uniform float uDamping;
void main() {
  vec3 pos = texture(uPos, vUv).xyz;
  vec3 vel = texture(uVel, vUv).xyz;
  vec3 tgt = texture(uTarget, vUv).xyz;
  // Per-particle phase from its own texel: the word arrives over a spread of
  // time rather than all at once.
  float phase = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
  float gain = mix(1.0, 0.25 + phase * 1.5, uStagger);
  vec3 acc = (tgt - pos) * uMorph * 9.0 * gain;
  // Top the fixed decay up to critical whenever the spring outruns it, so a
  // stiff morph never overshoots and springs back.
  float cHave = -60.0 * log(clamp(uDamping, 0.01, 0.999));
  float cNeed = 2.0 * sqrt(uMorph * 9.0);
  acc -= vel * max(0.0, cNeed - cHave);
  vel = vel * pow(uDamping, uDt * 60.0) + acc * uDt;
  fragColor = vec4(vel, 1.0);
}`;

const posFrag = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uPos;
uniform sampler2D uVel;
uniform float uDt;
void main() {
  fragColor = vec4(texture(uPos, vUv).xyz + texture(uVel, vUv).xyz * uDt, 1.0);
}`;

// Orthographic: the band is the clip box, one to one.
const pointVert = `#version 300 es
in vec2 reference;
uniform sampler2D uPos;
uniform sampler2D uVel;
uniform float uPointSize;
out float vSpeed;
void main() {
  vec3 p = texture(uPos, reference).xyz;
  vSpeed = length(texture(uVel, reference).xyz);
  gl_Position = vec4(p.xy, 0.0, 1.0);
  gl_PointSize = max(uPointSize, 1.0);
}`;

// Premultiplied out: the canvas is premultipliedAlpha, so a straight-alpha
// colour would be multiplied twice and every sprite would wear a dim halo.
const pointFrag = `#version 300 es
precision highp float;
in float vSpeed;
out vec4 fragColor;
uniform vec3 uColor;
uniform vec3 uAccent;
uniform float uGain;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d);
  if (r > 0.25) discard;
  float a = smoothstep(0.25, 0.02, r) * uGain;
  // A moving particle takes the signal, a settled one the ink: the colour is
  // the readout of the morph.
  vec3 col = mix(uColor, uAccent, clamp(vSpeed * 1.6, 0.0, 1.0));
  fragColor = vec4(col * a, a);
}`;

// --- Component --------------------------------------------------------------

export default function AuthSwarm({ word }: { word: AuthWord }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const drawRef = useRef<((dt: number) => false | undefined) | null>(null);
  const measureRef = useRef<((metrics: Metrics) => void) | null>(null);
  const retargetRef = useRef<((next: AuthWord) => void) | null>(null);
  const wordRef = useRef(word);
  // Survives a density rebuild: the entrance plays once per visit, never
  // again on a phone rotation or a window drag past a bucket edge.
  const enteredRef = useRef(false);
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  const [side, setSide] = useState(0);
  const [fallback, setFallback] = useState(false);

  const loop = useAnimationLoop({
    target: containerRef,
    dpr: "auto",
    resizeDebounceMs: 100,
    onResize: (metrics) => {
      setSide(sideFor(metrics.width));
      measureRef.current?.(metrics);
    },
    onFrame: ({ dt }) => (drawRef.current ? drawRef.current(dt) : false),
  });

  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);

  useEffect(() => {
    if (wordRef.current === word) return;
    wordRef.current = word;
    retargetRef.current?.(word);
  }, [word]);

  useEffect(() => {
    const container = containerRef.current;
    if (fallback || !container || side === 0) return;

    let cancelled = false;
    let dispose: (() => void) | null = null;
    const family = getComputedStyle(document.documentElement).getPropertyValue("--font-figtree").trim() || "sans-serif";

    function build(host: HTMLDivElement): (() => void) | null {
      const count = side * side;

      let renderer: Renderer;
      try {
        renderer = new Renderer({
          webgl: 2,
          alpha: true,
          premultipliedAlpha: true,
          antialias: false,
          depth: false,
          powerPreference: "high-performance",
        });
        const probe = renderer.gl as unknown as WebGL2RenderingContext;
        if (!renderer.isWebgl2 || !probe.getExtension("EXT_color_buffer_float")) {
          throw new Error("The swarm needs WebGL2 float targets");
        }
      } catch {
        setFallback(true);
        return null;
      }

      const gl = renderer.gl as unknown as WebGL2RenderingContext;
      gl.clearColor(0, 0, 0, 0);
      const canvas = gl.canvas as HTMLCanvasElement;
      canvas.style.position = "absolute";
      canvas.style.inset = "0";
      canvas.style.display = "block";
      host.appendChild(canvas);

      const onLost = (event: Event) => {
        event.preventDefault();
        if (!cancelled) setFallback(true);
      };
      canvas.addEventListener("webglcontextlost", onLost);

      const floatOptions = {
        width: side,
        height: side,
        type: gl.FLOAT,
        format: gl.RGBA,
        internalFormat: gl.RGBA32F,
        minFilter: gl.NEAREST,
        magFilter: gl.NEAREST,
      };
      const makeTarget = () =>
        new RenderTarget(renderer.gl, { ...floatOptions, depth: false, wrapS: gl.CLAMP_TO_EDGE, wrapT: gl.CLAMP_TO_EDGE });
      const makeTexture = (image: Float32Array) =>
        new Texture(renderer.gl, { ...floatOptions, image, generateMipmaps: false, flipY: false });

      let posRead = makeTarget();
      let posWrite = makeTarget();
      let velRead = makeTarget();
      let velWrite = makeTarget();

      const sample = createSampler(family, count);
      const first = sample(WORDS[wordRef.current]);
      let litFraction = first.litFraction;
      const targetTexture = makeTexture(first.positions);
      const zero = makeTexture(new Float32Array(count * 4));

      const quad = new Triangle(renderer.gl);
      const copyU = { uSrc: { value: zero } };
      const copyMesh = new Mesh(renderer.gl, {
        geometry: quad,
        program: new Program(renderer.gl, { vertex: quadVert, fragment: copyFrag, uniforms: copyU }),
      });
      const blit = (src: Texture, ...targets: RenderTarget[]) => {
        copyU.uSrc.value = src;
        for (const target of targets) renderer.render({ scene: copyMesh, target });
      };

      const velU = {
        uPos: { value: posRead.texture },
        uVel: { value: velRead.texture },
        uTarget: { value: targetTexture },
        uDt: { value: 0 },
        uMorph: { value: INTRO.morph },
        uStagger: { value: INTRO.stagger },
        uDamping: { value: DAMPING },
      };
      const posU = { uPos: { value: posRead.texture }, uVel: { value: velRead.texture }, uDt: { value: 0 } };
      const velMesh = new Mesh(renderer.gl, {
        geometry: quad,
        program: new Program(renderer.gl, { vertex: quadVert, fragment: velFrag, uniforms: velU }),
      });
      const posMesh = new Mesh(renderer.gl, {
        geometry: quad,
        program: new Program(renderer.gl, { vertex: quadVert, fragment: posFrag, uniforms: posU }),
      });

      const reference = new Float32Array(count * 2);
      for (let i = 0; i < count; i++) {
        reference[i * 2] = ((i % side) + 0.5) / side;
        reference[i * 2 + 1] = (Math.floor(i / side) + 0.5) / side;
      }
      const pointU = {
        uPos: { value: posRead.texture },
        uVel: { value: velRead.texture },
        uPointSize: { value: 1.5 },
        uGain: { value: 1 },
        uColor: { value: new Float32Array(3) },
        uAccent: { value: new Float32Array(3) },
      };
      const pointProgram = new Program(renderer.gl, {
        vertex: pointVert,
        fragment: pointFrag,
        uniforms: pointU,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      const points = new Mesh(renderer.gl, {
        geometry: new Geometry(renderer.gl, { reference: { size: 2, data: reference } }),
        program: pointProgram,
        mode: gl.POINTS,
      });

      // Role tokens, resolved to bytes; re-read whenever <html> changes (theme
      // class, skin attribute, accent variable). Dark glass glows additively;
      // light paper composites normally, where additive would wash out.
      const readTheme = () => {
        const [ink, signal] = resolveColors(["var(--ink-2)", "var(--signal)"]);
        if (ink) pointU.uColor.value.set(unit(ink));
        if (signal) pointU.uAccent.value.set(unit(signal));
        if (document.documentElement.classList.contains("dark")) {
          pointProgram.setBlendFunc(gl.ONE, gl.ONE, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        } else {
          pointProgram.setBlendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        }
      };
      readTheme();
      const observer = new MutationObserver(() => {
        readTheme();
        loop.paint();
      });
      observer.observe(document.documentElement, { attributes: true });

      // Overdraw control. litFraction alone only evens brightness between
      // words (the sampler's size is fixed); the band's area is what stops a
      // phone-width band from stacking every sprite into a blown-out blob.
      let bandArea = 1;
      let sprite = 1.5;
      const updateGain = () => {
        const inked = Math.max(litFraction * bandArea, 1);
        const cover = (count * sprite * sprite) / inked;
        pointU.uGain.value = clamp(GAIN_K / cover, GAIN_MIN, 1);
      };

      const snap = () => {
        blit(targetTexture, posRead, posWrite);
        blit(zero, velRead, velWrite);
      };

      let budget = 0;
      if (!enteredRef.current && !reducedRef.current) {
        const seed = makeTexture(scatter(count));
        blit(seed, posRead, posWrite);
        blit(zero, velRead, velWrite);
        budget = SETTLE_SECONDS;
      } else {
        snap();
      }
      enteredRef.current = true;

      drawRef.current = (dt) => {
        if (budget > 0 && reducedRef.current) {
          snap();
          budget = 0;
        }
        if (budget > 0) {
          const step = Math.min(dt, MAX_STEP);
          if (step > 0) {
            velU.uPos.value = posRead.texture;
            velU.uVel.value = velRead.texture;
            velU.uDt.value = step;
            renderer.render({ scene: velMesh, target: velWrite });
            [velRead, velWrite] = [velWrite, velRead];

            posU.uPos.value = posRead.texture;
            posU.uVel.value = velRead.texture;
            posU.uDt.value = step;
            renderer.render({ scene: posMesh, target: posWrite });
            [posRead, posWrite] = [posWrite, posRead];

            // Counted in sim time, not wall time: a throttled frame advances
            // the springs less, so the window has to wait for them.
            budget -= step;
            if (budget <= 0) snap();
          }
        }
        pointU.uPos.value = posRead.texture;
        pointU.uVel.value = velRead.texture;
        renderer.render({ scene: points });
        return budget > 0 ? undefined : false;
      };

      measureRef.current = ({ width, height, dpr }) => {
        renderer.dpr = dpr;
        renderer.setSize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
        bandArea = width * height;
        sprite = spriteFor(width);
        pointU.uPointSize.value = sprite * dpr;
        updateGain();
      };

      retargetRef.current = (next) => {
        const target = sample(WORDS[next]);
        targetTexture.image = target.positions;
        targetTexture.needsUpdate = true;
        litFraction = target.litFraction;
        updateGain();
        velU.uMorph.value = HOVER.morph;
        velU.uStagger.value = HOVER.stagger;
        if (reducedRef.current) {
          snap();
          budget = 0;
        } else {
          budget = SETTLE_SECONDS;
        }
        loop.start();
      };

      loop.resize();
      loop.start();

      return () => {
        drawRef.current = null;
        measureRef.current = null;
        retargetRef.current = null;
        observer.disconnect();
        canvas.removeEventListener("webglcontextlost", onLost);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
        canvas.remove();
      };
    }

    void document.fonts
      .load(`800 64px ${family}`)
      .catch(() => [])
      .then(() => {
        if (cancelled) return;
        dispose = build(container);
      });

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [fallback, side, loop]);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="@container relative w-full select-none"
      style={{ aspectRatio: WORD_ASPECT }}
    >
      {fallback ? (
        <span
          className="font-display absolute inset-0 flex items-center justify-center leading-none font-extrabold text-ink-3"
          style={{ fontSize: `${FALLBACK_CQI}cqi` }}
        >
          {WORDS[word]}
        </span>
      ) : null}
    </div>
  );
}
