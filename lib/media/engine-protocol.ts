// Messages between the page and the media worker (engine.worker.ts). Type-only
// imports, so the worker bundle carries nothing it doesn't use.

import type { Probe } from "./ladder";

export type EngineRequest =
  /** Fingerprint and probe a local file (V54, V52): header reads only. */
  | { type: "open"; file: File }
  /** The same, for a file behind a URL that answers Range requests (the desktop's `wanheda-file:`, V72). */
  | { type: "open-url"; url: string; size: number }
  /** Start the remux (V53) of the opened file into an MSE source owned by the worker. */
  | { type: "remux"; video: number | null; audio: number | null }
  /**
   * The same, but the bytes come from the desktop shell's ffmpeg (V74): `url` is a `wanheda-transcode:` stream of
   * the chosen tracks, video copied and audio as AAC. The worker adds where to start.
   */
  | { type: "transcode"; video: number | null; audio: number | null; url: string }
  /** The element's clock, so the worker keeps ≤ 30 s ahead and drops > 20 s behind. */
  | { type: "time"; t: number }
  /** A seek: past what's buffered, the remux restarts from the keyframe at or before `t`. */
  | { type: "seek"; t: number }
  /** One frame at `at` (0..1 of the length), `width` px wide, as an image for the library (T72). */
  | { type: "thumb"; at: number; width: number }
  | { type: "close" };

export type EngineResponse =
  | { type: "opened"; fp: string; probe: Probe | null; probeError: string | null }
  | { type: "open-failed"; message: string }
  /** The MSE handle to set as the element's `srcObject`. Transferred. */
  | { type: "handle"; handle: unknown }
  /** Bytes reached the source buffer for the first time since a (re)start. */
  | { type: "appended"; startS: number }
  | { type: "remux-ended" }
  | { type: "remux-failed"; message: string }
  /** The frame asked for (WebP where the browser can, else whatever `convertToBlob` gave), or null. */
  | { type: "thumb"; blob: Blob | null };

/** Look-ahead and trim windows for the remux buffer (V53). */
export const AHEAD_S = 30;
export const BEHIND_S = 20;
