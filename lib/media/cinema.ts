import { createDevicePref } from "@/hooks/device-pref";
import { parseVolume, serializeVolume, type Volume } from "./volume";

// The video player's small rules and its prefs (T72, V65). The prefs are per
// device, like the speakers and the screen they describe.

/**
 * HD, QHD or 4K from the picture's short side, so a portrait 1080×1920 clip
 * reads HD, not 4K. Null below 720 or before the size is known.
 */
export function resolutionLabel(width: number, height: number): "4K" | "QHD" | "HD" | null {
  const short = Math.min(width, height);
  if (!Number.isFinite(short) || short <= 0) return null;
  if (short >= 2160) return "4K";
  if (short >= 1440) return "QHD";
  if (short >= 720) return "HD";
  return null;
}

/** Fit shows the whole picture (bars where the shapes differ); Fill crops it to the frame. */
export type Fit = "contain" | "cover";
export const fitPref = createDevicePref<Fit>(
  "wanheda-video-fit",
  (raw) => (raw === "cover" ? "cover" : "contain"),
  (v) => (v === "cover" ? "cover" : null),
);

export type CaptionSize = "s" | "m" | "l";
export const CAPTION_SIZES: readonly CaptionSize[] = ["s", "m", "l"];
export const CAPTION_SIZE_LABELS: Record<CaptionSize, string> = { s: "Small", m: "Medium", l: "Large" };
export const captionSizePref = createDevicePref<CaptionSize>(
  "wanheda-caption-size",
  (raw) => (raw === "s" || raw === "l" ? raw : "m"),
  (v) => (v === "m" ? null : v),
);

/** Play the next video when one ends (on by default). */
export const autoplayPref = createDevicePref<boolean>(
  "wanheda-video-autoplay",
  (raw) => raw !== "0",
  (v) => (v ? null : "0"),
);

/** The video's own volume, apart from music's: the same level-and-mute shape. */
export const videoVolumePref = createDevicePref<Volume>("wanheda-video-volume", parseVolume, serializeVolume);

/** "mm:ss" (or "h:mm:ss"), floored as a player's clock is; "-mm:ss" for time left. */
export function playerClock(s: number, left = false): string {
  const v = Math.max(0, Math.floor(Number.isFinite(s) ? s : 0));
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  const sec = String(v % 60).padStart(2, "0");
  const body = h > 0 ? `${String(h)}:${String(m).padStart(2, "0")}:${sec}` : `${String(m)}:${sec}`;
  return left ? `-${body}` : body;
}

/** "27m left", "1h 22m left", "40s left": a card's time remaining. */
export function timeLeft(positionS: number, durationS: number): string {
  const left = Math.max(0, Math.round(durationS - positionS));
  if (left < 60) return `${String(left)}s left`;
  const h = Math.floor(left / 3600);
  const m = Math.round((left % 3600) / 60);
  if (h === 0) return `${String(m)}m left`;
  return m === 0 ? `${String(h)}h left` : `${String(h)}h ${String(m)}m left`;
}

/** The next-video card shows in a video's last seconds (or once a short clip ends). */
export const OFFER_NEXT_S = 10;
/** A clip shorter than this is only offered the next one once it has ended. */
export const SHORT_CLIP_S = 60;
/** The countdown after a short clip ends. */
export const AFTER_END_S = 5;

/**
 * Whether the "next video" card shows (T72): only with autoplay on and a next
 * video to go to, in the last 10 s of a video of a minute or more, or once a
 * shorter clip (or one of unknown length) has ended.
 */
export function shouldOfferNext(o: { t: number; duration: number; ended: boolean; hasNext: boolean; autoplay: boolean }): boolean {
  if (!o.hasNext || !o.autoplay) return false;
  if (o.ended) return true;
  if (!Number.isFinite(o.duration) || o.duration < SHORT_CLIP_S) return false;
  return o.duration - o.t <= OFFER_NEXT_S;
}

/** Seconds on the card's countdown: what's left of the video, at most 8; a fixed 5 once it has ended. */
export function countdownFrom(remainingS: number, ended: boolean): number {
  if (ended) return AFTER_END_S;
  return Math.max(1, Math.min(8, Math.floor(remainingS)));
}
