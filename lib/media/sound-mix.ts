import { createDevicePref } from "@/hooks/device-pref";

// How sounds share the speakers (V60, Settings → Sound): per device, since
// speakers are. `pause` (the default): starting one pauses the others. `duck`:
// while speech plays, music or video drops to the duck level and comes back
// when speech stops or pauses. `mix`: both at full. Video and music always
// pause each other, whatever the mode: two soundtracks at once is never wanted.

export type SoundMode = "pause" | "duck" | "mix";
export const SOUND_MODES: readonly SoundMode[] = ["pause", "duck", "mix"];
export const DUCK_LEVELS = [20, 35, 50] as const;
export type DuckLevel = (typeof DUCK_LEVELS)[number];

export type SoundMix = { mode: SoundMode; level: DuckLevel };
export const DEFAULT_SOUND_MIX: SoundMix = { mode: "pause", level: 35 };

export const SOUND_MODE_LABELS: Record<SoundMode, string> = { pause: "Pause the other", duck: "Lower the other", mix: "Play both" };

/** Stored as `mode` or `mode:level`; anything unknown falls back to the default. */
export function parseSoundMix(raw: string | null): SoundMix {
  if (raw === null) return DEFAULT_SOUND_MIX;
  const [m, l] = raw.trim().split(":");
  const mode = (SOUND_MODES as readonly string[]).includes(m ?? "") ? (m as SoundMode) : null;
  if (!mode) return DEFAULT_SOUND_MIX;
  const n = l === undefined ? DEFAULT_SOUND_MIX.level : Number(l);
  const level = (DUCK_LEVELS as readonly number[]).includes(n) ? (n as DuckLevel) : DEFAULT_SOUND_MIX.level;
  return { mode, level };
}

export function serializeSoundMix(v: SoundMix): string | null {
  if (v.mode === DEFAULT_SOUND_MIX.mode && v.level === DEFAULT_SOUND_MIX.level) return null;
  return v.level === DEFAULT_SOUND_MIX.level ? v.mode : `${v.mode}:${String(v.level)}`;
}

export const soundMixPref = createDevicePref<SoundMix>("wanheda-sound-mix", parseSoundMix, serializeSoundMix);

export type SoundOwner = "speech" | "video" | "music";

/** Whether `starting` pauses `other` when it starts. Video and music always do; speech only in `pause` mode. */
export function startPauses(starting: SoundOwner, other: SoundOwner, mode: SoundMode): boolean {
  if (starting === other) return false;
  if (starting !== "speech" && other !== "speech") return true;
  return mode === "pause";
}

/** The gain music or video plays at: the duck level while speech plays in `duck` mode, else full. */
export function duckGain(owner: SoundOwner, mix: SoundMix, speechPlaying: boolean): number {
  if (owner === "speech" || mix.mode !== "duck" || !speechPlaying) return 1;
  return mix.level / 100;
}

/** A linear ramp's value `elapsedS` into a ramp from `from` to `to` over `durationS`. */
export function rampAt(from: number, to: number, durationS: number, elapsedS: number): number {
  if (durationS <= 0 || elapsedS >= durationS) return to;
  if (elapsedS <= 0) return from;
  return from + (to - from) * (elapsedS / durationS);
}
