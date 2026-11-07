// The demo library's sound (music-seed.ts): test tones made on the fly for a
// `tone:` path, never copyrighted audio. The "Gapless Run" album is one chirp
// cut into three parts with its phase carried across, so a gap or a click
// between parts would be heard: the demo's gapless check.

export type ToneSpec = {
  wave: "sine" | "square" | "chirp";
  /** Sine and square: the pitch. */
  hz: number;
  /** Square: the share of each cycle that is high. */
  duty: number;
  /** Chirp: where this part starts in the whole sweep, and the sweep. */
  chirp: { offsetS: number; totalS: number; fromHz: number; toHz: number } | null;
  fadeIn: boolean;
  fadeOut: boolean;
};

const SINES: Record<string, number> = { "A 440": 440, "Middle C": 261.63, "Low E": 82.41, "High G": 783.99 };
const DUTIES: Record<string, number> = { "Fifty Percent": 0.5, "Twelve and a Half": 0.125, "Duty Cycle": 0.25 };
const CHIRP_PART_S = 10;
const CHIRP_PARTS = 3;

const FADE_S = 0.01;
const SINE_GAIN = 0.2;
const SQUARE_GAIN = 0.07;

export const isTonePath = (path: string) => path.startsWith("tone:");

/** What a `tone:<album>/<nn> <title>` path plays. */
export function toneSpec(path: string): ToneSpec {
  const title = path.replace(/^tone:[^/]*\/\d+\s+/, "");
  const base: ToneSpec = { wave: "sine", hz: 440, duty: 0.5, chirp: null, fadeIn: true, fadeOut: true };
  const sine = SINES[title];
  if (sine !== undefined) return { ...base, hz: sine };
  const duty = DUTIES[title];
  if (duty !== undefined) return { ...base, wave: "square", hz: 110, duty };
  const part = /^Chirp, part (\d)$/.exec(title)?.[1];
  if (part) {
    const n = Number(part);
    return {
      ...base,
      wave: "chirp",
      chirp: { offsetS: (n - 1) * CHIRP_PART_S, totalS: CHIRP_PART_S * CHIRP_PARTS, fromHz: 220, toHz: 880 },
      // Only the sweep's own ends fade: a fade at a seam would hide a gap.
      fadeIn: n === 1,
      fadeOut: n === CHIRP_PARTS,
    };
  }
  return base;
}

/** `frames` samples of the tone from frame `start`, for a track `seconds` long. */
export function fillTone(spec: ToneSpec, start: number, frames: number, sampleRate: number, seconds: number): Float32Array<ArrayBuffer> {
  const out = new Float32Array(frames);
  const total = Math.round(seconds * sampleRate);
  const fade = Math.round(FADE_S * sampleRate);
  for (let i = 0; i < frames; i++) {
    const n = start + i;
    if (n >= total) break;
    const t = n / sampleRate;
    let v: number;
    if (spec.wave === "chirp" && spec.chirp) {
      // Linear sweep, phase from the start of the whole sweep: parts join without a step.
      const { offsetS, totalS, fromHz, toHz } = spec.chirp;
      const g = offsetS + t;
      const k = (toHz - fromHz) / totalS;
      v = SINE_GAIN * Math.sin(2 * Math.PI * (fromHz * g + (k * g * g) / 2));
    } else if (spec.wave === "square") {
      v = (t * spec.hz) % 1 < spec.duty ? SQUARE_GAIN : -SQUARE_GAIN;
    } else {
      v = SINE_GAIN * Math.sin(2 * Math.PI * spec.hz * t);
    }
    if (spec.fadeIn && n < fade) v *= n / fade;
    if (spec.fadeOut && total - n <= fade) v *= (total - n - 1) / fade;
    out[i] = v;
  }
  return out;
}
