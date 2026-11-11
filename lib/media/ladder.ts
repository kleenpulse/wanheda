// The playback ladder (V52, ADR-0013): native, then remux, then transcode,
// else "can't play" with the reason. Pure: the browser's answers arrive as
// `PlaybackCaps`, gathered by lib/platform/media.ts, so every case is tested
// here without a browser.

export type TrackKind = "video" | "audio";

/** One track as the probe read it from the container header. */
export type ProbeTrack = {
  id: number;
  kind: TrackKind;
  /** Mediabunny's codec name ("avc", "aac", "ac3", …), or null when unknown. */
  codec: string | null;
  /** RFC 6381 codec string ("avc1.64001f", "mp4a.40.2"), or null when there is none. */
  codecString: string | null;
  /** The container marks it for automatic selection: what a `<video>` element plays. */
  isDefault: boolean;
  language: string | null;
  name: string | null;
};

/** What the probe worker learnt from the container header (never the whole file). */
export type Probe = {
  /** Container name for messages ("Matroska", "MPEG-TS", …). */
  format: string;
  /** Container MIME type as the browser names it ("video/x-matroska", "video/mp2t", …). */
  mime: string;
  durationS: number | null;
  tracks: readonly ProbeTrack[];
};

/** The browser's answers for one track. */
export type TrackCaps = {
  /** Plays inside this container natively (`canPlayType` with the codec, or the decoder accepts it). */
  native: boolean;
  /** Plays once remuxed into fragmented MP4 (`MediaSource.isTypeSupported`). */
  remux: boolean;
};

export type PlaybackCaps = {
  /** The browser's `<video>` opens this container. */
  container: boolean;
  tracks: Readonly<Record<number, TrackCaps>>;
  /** MSE can be driven from a worker (`MediaSource.canConstructInDedicatedWorker`). */
  workerMse: boolean;
  /** Codecs a transcoder on this device can decode: the desktop app's bundled ffmpeg (V74). Empty on the web. */
  transcodable: readonly string[];
  /** The native attempt already failed to load (V52: a native load error falls to remux). */
  nativeFailed?: boolean;
};

/** Which tracks to play. Unset means the default tracks. */
export type TrackChoice = { video?: number; audio?: number };

export type CannotReason =
  | { code: "no-tracks" }
  | { code: "codec"; kind: TrackKind; codec: string; trackId: number; trackNumber: number }
  | { code: "no-worker-mse" };

export type PlaybackPlan =
  | { mode: "native"; video: number | null; audio: number | null }
  | { mode: "remux"; video: number | null; audio: number | null }
  | { mode: "transcode"; video: number | null; audio: number | null; tracks: readonly number[] }
  | { mode: "cannot"; reason: CannotReason };

function pick(tracks: readonly ProbeTrack[], kind: TrackKind, chosen: number | undefined): ProbeTrack | null {
  const ofKind = tracks.filter((t) => t.kind === kind);
  if (chosen !== undefined) {
    const t = ofKind.find((x) => x.id === chosen);
    if (t) return t;
  }
  return ofKind.find((t) => t.isDefault) ?? ofKind[0] ?? null;
}

/** The track a `<video>` element would play on its own for this kind. */
function nativeDefault(tracks: readonly ProbeTrack[], kind: TrackKind): ProbeTrack | null {
  return pick(tracks, kind, undefined);
}

export function planPlayback(probe: Probe, caps: PlaybackCaps, choice: TrackChoice = {}): PlaybackPlan {
  const capsOf = (t: ProbeTrack): TrackCaps => caps.tracks[t.id] ?? { native: false, remux: false };
  const video = pick(probe.tracks, "video", choice.video);
  let audio = pick(probe.tracks, "audio", choice.audio);
  // No choice made and the default audio can't play (AC3 default + AAC 2nd):
  // take the first audio track that plays once remuxed (V52), not silence.
  if (choice.audio === undefined && audio && !capsOf(audio).remux && !(capsOf(audio).native && caps.container)) {
    audio = probe.tracks.find((t) => t.kind === "audio" && capsOf(t).remux) ?? audio;
  }
  const chosen = [video, audio].filter((t): t is ProbeTrack => t !== null);
  if (chosen.length === 0) return { mode: "cannot", reason: { code: "no-tracks" } };

  const ids = { video: video?.id ?? null, audio: audio?.id ?? null };

  // Native plays the default tracks only (`audioTracks` is behind a flag in Chrome).
  const onDefaults = chosen.every((t) => t === nativeDefault(probe.tracks, t.kind));
  if (caps.container && !caps.nativeFailed && onDefaults && chosen.every((t) => capsOf(t).native)) {
    return { mode: "native", ...ids };
  }

  // Every chosen track is checked, never the container alone: an AC3 MKV opens
  // natively and plays as silent video with no error (T60).
  const unplayable = chosen.filter((t) => !capsOf(t).remux);
  if (unplayable.length === 0) {
    if (!caps.workerMse) return { mode: "cannot", reason: { code: "no-worker-mse" } };
    return { mode: "remux", ...ids };
  }

  const stuck = unplayable.find((t) => t.codec === null || !caps.transcodable.includes(t.codec));
  if (!stuck) {
    // The converted stream plays through the same worker-owned MSE as a remux.
    if (!caps.workerMse) return { mode: "cannot", reason: { code: "no-worker-mse" } };
    return { mode: "transcode", ...ids, tracks: unplayable.map((t) => t.id) };
  }

  const ofKind = probe.tracks.filter((t) => t.kind === stuck.kind);
  return {
    mode: "cannot",
    reason: {
      code: "codec",
      kind: stuck.kind,
      codec: stuck.codec ?? "unknown",
      trackId: stuck.id,
      trackNumber: ofKind.indexOf(stuck) + 1,
    },
  };
}

/**
 * A track's place among the file's tracks of its kind, from 0: how the desktop app's converter names a track (V74).
 * Null when the probe has no such track.
 */
export function trackOrdinal(probe: Probe, id: number | null): number | null {
  const track = probe.tracks.find((t) => t.id === id);
  if (!track) return null;
  return probe.tracks.filter((t) => t.kind === track.kind).indexOf(track);
}

const CODEC_NAMES: Readonly<Record<string, string>> = {
  avc: "H.264",
  hevc: "HEVC (H.265)",
  vp8: "VP8",
  vp9: "VP9",
  av1: "AV1",
  prores: "ProRes",
  aac: "AAC",
  mp3: "MP3",
  opus: "Opus",
  vorbis: "Vorbis",
  flac: "FLAC",
  ac3: "Dolby Digital (AC3)",
  eac3: "Dolby Digital Plus (E-AC3)",
  dts: "DTS",
  truehd: "Dolby TrueHD",
};

export function codecName(codec: string): string {
  return CODEC_NAMES[codec] ?? codec.toUpperCase();
}

/** The audio codecs the desktop app converts while it plays (desktop/transcode.ts keeps the same list; a test holds them equal). */
export const DESKTOP_CONVERTS: readonly string[] = ["ac3", "eac3", "dts"];

/** The owner-facing sentence for a "can't play" plan: what, which track, why. On the web it says when the desktop app would play it. */
export function cannotMessage(reason: CannotReason, where: { desktop?: boolean } = {}): string {
  switch (reason.code) {
    case "no-tracks":
      return "This file has no video or audio track this player can read.";
    case "no-worker-mse":
      return "This file needs converting while it plays, and this browser can't do that. Try it in Chrome.";
    case "codec":
      return `${reason.kind === "audio" ? "Audio" : "Video"} track ${reason.trackNumber} is ${codecName(reason.codec)}, which ${where.desktop ? "Wanheda" : "this browser"} can't play.${
        !where.desktop && reason.kind === "audio" && DESKTOP_CONVERTS.includes(reason.codec) ? " Wanheda's desktop app converts it while it plays." : ""
      }`;
  }
}
