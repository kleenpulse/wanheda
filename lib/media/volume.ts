import { createDevicePref } from "@/hooks/device-pref";

// Music volume (T64): a level 0–1 and a mute, per device like the speakers.
// The slider is linear to the hand, the gain is its square, so the low end
// isn't all crammed into the first notch.

export type Volume = { level: number; muted: boolean };
export const DEFAULT_VOLUME: Volume = { level: 1, muted: false };
export const VOLUME_STEP = 0.1;

const clamp = (n: number) => Math.min(1, Math.max(0, n));
/** Two decimals: a nudge of 0.1 never drifts to 0.30000000000000004. */
const round = (n: number) => Math.round(clamp(n) * 100) / 100;

/** Stored as the level, with "m" after it when muted ("0.6", "0.6m"); anything else is the default. */
export function parseVolume(raw: string | null): Volume {
  if (raw === null) return DEFAULT_VOLUME;
  const m = /^(\d(?:\.\d+)?)(m?)$/.exec(raw.trim());
  if (!m) return DEFAULT_VOLUME;
  const level = Number(m[1]);
  if (!Number.isFinite(level) || level > 1) return DEFAULT_VOLUME;
  return { level: round(level), muted: m[2] === "m" };
}

export function serializeVolume(v: Volume): string | null {
  if (v.level === DEFAULT_VOLUME.level && !v.muted) return null;
  return `${String(round(v.level))}${v.muted ? "m" : ""}`;
}

/** The gain the slider means: silent when muted, the level squared otherwise. */
export function volumeGain(v: Volume): number {
  return v.muted ? 0 : round(v.level) ** 2;
}

/** A nudge by `by` (keys, palette); turning it up from mute unmutes. */
export function nudgeVolume(v: Volume, by: number): Volume {
  return { level: round(v.level + by), muted: v.muted && by <= 0 };
}

/** One mouse-wheel notch turns the volume by this much (the slider's own step). */
export const WHEEL_STEP = 0.05;
/** A notch is 100 px in Chrome and Edge; a trackpad's small deltas add up to one. */
const NOTCH_PX = 100;

/**
 * Wheel deltas → volume steps. `carry` is what's left from earlier events;
 * turning the other way starts afresh. Up (a negative deltaY) is louder.
 */
export function wheelSteps(carry: number, deltaY: number, deltaMode: number): { steps: number; carry: number } {
  const px = -deltaY * (deltaMode === 1 ? 40 : deltaMode === 2 ? 800 : 1);
  const total = (Math.sign(carry) === -Math.sign(px) ? 0 : carry) + px;
  const steps = Math.trunc(total / NOTCH_PX) || 0; // never -0
  return { steps, carry: total - steps * NOTCH_PX };
}

export const volumePref = createDevicePref<Volume>("wanheda-music-volume", parseVolume, serializeVolume);
