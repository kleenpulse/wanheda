import { createDevicePref } from "@/hooks/device-pref";
import { parseVolume, serializeVolume, type Volume } from "@/lib/media/volume";
import { clampRate } from "./engine";
import { catalogVoice, DEFAULT_VOICE } from "./voices";

// Speech prefs (SPEC V46): the chosen voice, speed and volume are per device, like
// the voices themselves (a voice another device holds is no use here).
// The speech store reads them at each play and writes the speed when it changes.

export const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

/** A stored voice id, or the default when it's missing or no longer in the catalog. */
export function parseVoicePref(raw: string | null): string {
  return raw !== null && catalogVoice(raw) ? raw : DEFAULT_VOICE;
}

/** A stored speed, clamped to 0.5–2; 1 when missing or not a number. */
export function parseRatePref(raw: string | null): number {
  if (raw === null || raw.trim() === "") return 1;
  return clampRate(Number(raw));
}

export const voicePref = createDevicePref<string>("wanheda-speech-voice", parseVoicePref, (v) => (v === DEFAULT_VOICE ? null : v));

export const ratePref = createDevicePref<number>("wanheda-speech-rate", parseRatePref, (v) => (v === 1 ? null : String(clampRate(v))));

/** Read-aloud's own volume, apart from music's: same shape, same curve (level² is the gain). */
export const speechVolumePref = createDevicePref<Volume>("wanheda-speech-volume", parseVolume, serializeVolume);
