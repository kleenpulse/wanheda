import { createDevicePref } from "@/hooks/device-pref";

// The music glow behind a song without cover art (Settings → Sound), per
// device like the rest of the sound prefs. Brightness scales the light (off
// draws none); movement scales how hard the music moves it.

export const GLOW_BRIGHTNESS = ["off", "low", "medium", "high"] as const;
export const GLOW_MOVEMENT = ["calm", "medium", "lively"] as const;
export type GlowBrightness = (typeof GLOW_BRIGHTNESS)[number];
export type GlowMovement = (typeof GLOW_MOVEMENT)[number];

export type Glow = { brightness: GlowBrightness; movement: GlowMovement };
export const DEFAULT_GLOW: Glow = { brightness: "medium", movement: "medium" };

/** Multipliers on the glow's light and on its music-driven motion. */
export const BRIGHTNESS_SCALE: Record<GlowBrightness, number> = { off: 0, low: 0.6, medium: 1, high: 1.35 };
export const MOVEMENT_SCALE: Record<GlowMovement, number> = { calm: 0.5, medium: 1, lively: 1.6 };

export const BRIGHTNESS_LABELS: Record<GlowBrightness, string> = { off: "Off", low: "Low", medium: "Medium", high: "High" };
export const MOVEMENT_LABELS: Record<GlowMovement, string> = { calm: "Calm", medium: "Medium", lively: "Lively" };

const isOne = <T extends string>(list: readonly T[], v: string | undefined): v is T => (list as readonly string[]).includes(v ?? "");

/** Stored as `brightness:movement`; an unknown half falls back to its default. */
export function parseGlow(raw: string | null): Glow {
  if (raw === null) return DEFAULT_GLOW;
  const [b, m] = raw.trim().split(":");
  return {
    brightness: isOne(GLOW_BRIGHTNESS, b) ? b : DEFAULT_GLOW.brightness,
    movement: isOne(GLOW_MOVEMENT, m) ? m : DEFAULT_GLOW.movement,
  };
}

export function serializeGlow(v: Glow): string | null {
  if (v.brightness === DEFAULT_GLOW.brightness && v.movement === DEFAULT_GLOW.movement) return null;
  return `${v.brightness}:${v.movement}`;
}

export const glowPref = createDevicePref<Glow>("wanheda-music-glow", parseGlow, serializeGlow);

/**
 * Whether the card shows the glow: only behind a song without art, and not when
 * it's off. The card mounts a fresh glow each time this turns true, so the
 * glow's canvas, resize and on-screen observers bind to the box it really draws in.
 */
export function showsGlow(hasArt: boolean, glow: Glow): boolean {
  return !hasArt && glow.brightness !== "off";
}
