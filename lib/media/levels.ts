// The equalizer's four bars from the music's actual sound (T64): an
// AnalyserNode's frequency bins grouped into four bands spaced like hearing
// (log). Music only moves within a narrow slice of the byte range, so each bar
// keeps an auto-gain (its recent floor and ceiling) and is stretched across
// that span: the hats dance as hard as the kick. Bars snap up and drop fast.

export const BARS = 4;
/** Where a bar rests: silence, a pause, or no music. */
export const REST = 0.18;

/** The bins each bar reads: log-spaced over the lower `use` share of the spectrum, where music lives. */
export function bandEdges(bins: number, bars = BARS, use = 0.7): number[] {
  const top = Math.max(bars + 1, Math.floor(bins * use));
  const edges = [1];
  for (let i = 1; i <= bars; i++) edges.push(Math.max((edges[i - 1] ?? 1) + 1, Math.round(Math.exp((Math.log(top) * i) / bars))));
  return edges;
}

/** Each band (byte data, 0–255) as 0–1: mostly its peak, so a hit isn't averaged away. */
export function bandLevels(data: ArrayLike<number>, edges: readonly number[]): number[] {
  const out: number[] = [];
  for (let b = 0; b + 1 < edges.length; b++) {
    const from = edges[b] ?? 0;
    const to = Math.min(data.length, edges[b + 1] ?? from + 1);
    let sum = 0;
    let peak = 0;
    for (let i = from; i < to; i++) {
      const v = data[i] ?? 0;
      sum += v;
      if (v > peak) peak = v;
    }
    out.push(to > from ? (0.65 * peak + (0.35 * sum) / (to - from)) / 255 : 0);
  }
  return out;
}

/** Per bar: the recent floor and ceiling it is stretched between. */
export type Gain = { lo: number[]; hi: number[] };

export function newGain(bars = BARS): Gain {
  return { lo: Array.from({ length: bars }, () => 1), hi: Array.from({ length: bars }, () => 0) };
}

/** Narrowest span a bar is stretched over: below it, near-silence would turn into full-height noise. */
const MIN_SPAN = 0.12;

/**
 * Stretches each level across its bar's recent range. The ceiling jumps to a
 * new peak and sinks slowly; the floor drops to a new low and creeps up. A
 * gentle curve then lifts the middle, so the bars live in their upper half
 * while the music is loud. Updates `gain` in place.
 */
export function autoGain(gain: Gain, levels: readonly number[]): number[] {
  return levels.map((v, i) => {
    const hi = Math.max(v, (gain.hi[i] ?? 0) * 0.992 + v * 0.008);
    const lo = Math.min(v, (gain.lo[i] ?? 1) * 0.985 + v * 0.015);
    gain.hi[i] = hi;
    gain.lo[i] = lo;
    const span = Math.max(MIN_SPAN, hi - lo);
    const t = Math.min(1, Math.max(0, (v - lo) / span));
    return t ** 0.7;
  });
}

/** A bar's next height: snaps up, drops quickly, never below its rest. */
export function easeBar(prev: number, target: number, rise = 0.85, fall = 0.28): number {
  const t = Math.max(REST, Math.min(1, REST + target * (1 - REST)));
  return prev + (t - prev) * (t > prev ? rise : fall);
}
