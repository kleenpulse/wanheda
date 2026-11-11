import { FILE_SCHEME, isRootId, parseFileUrl } from "./files";

/*
 * Native transcode (SPEC V74), pure. A file whose audio the browser can't
 * decode (AC3, E-AC3, DTS) plays through the bundled ffmpeg: the video is
 * copied, the audio becomes AAC, and the result streams out as fragmented MP4
 * on `wanheda-transcode://<source>/<path>?v=<n>&a=<n>&ss=<seconds>`.
 * The media worker appends that stream to its MSE buffer, exactly as it does
 * a remux (V53). Nothing is written to disk.
 *
 * ffmpeg's arguments come from the one template below. The page chooses
 * three numbers; it never supplies a path, an option or a string.
 *
 * Tracks are named by position: the nth video and the nth audio track, from
 * 0, in the file's own order. ffmpeg gives Matroska tracks no ids, so the
 * container's ids (which the probe reads) can't name them for every format.
 */

export const TRANSCODE_SCHEME = "wanheda-transcode";

/** The audio codecs converted, by the probe's name (Mediabunny's), with ffmpeg's decoder for each. */
export const AUDIO_DECODERS: Readonly<Record<string, string>> = { ac3: "ac3", eac3: "eac3", dts: "dca" };

/** The path a one-file grant's URL carries (a picked file has no folder to be relative to). */
export const GRANT_PATH = "f";

export type TranscodeRequest = {
  /** A native folder's id (V72), or a one-file grant's token. */
  source: string;
  /** The path under a native folder; a grant ignores it. */
  segments: string[];
  /** Which video and which audio track to keep, counted from 0 among the file's tracks of that kind; `video` null for audio alone. */
  video: number | null;
  audio: number;
  /** Where to start: a timestamp in the file's own clock (a transport stream rarely starts at 0). */
  startS: number;
};

const TRACK_INDEX = /^[0-9]{1,3}$/;
const SECONDS = /^[0-9]{1,7}(\.[0-9]{1,6})?$/;

function trackIndex(value: string | null): number | null {
  return value !== null && TRACK_INDEX.test(value) ? Number(value) : null;
}

/**
 * A `wanheda-transcode:` URL's request, or null. The path follows
 * `wanheda-file:`'s rules (files.ts); the query takes `a` once, and `v` and
 * `ss` at most once each, and nothing else.
 */
export function parseTranscodeUrl(raw: string): TranscodeRequest | null {
  const prefix = `${TRANSCODE_SCHEME}://`;
  if (!raw.startsWith(prefix) || raw.includes("#")) return null;
  const q = raw.indexOf("?");
  if (q === -1) return null;
  const file = parseFileUrl(`${FILE_SCHEME}://${raw.slice(prefix.length, q)}`);
  if (!file) return null;
  const params = new URLSearchParams(raw.slice(q + 1));
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length || keys.some((k) => k !== "v" && k !== "a" && k !== "ss")) return null;
  const audio = trackIndex(params.get("a"));
  if (audio === null) return null;
  const video = params.has("v") ? trackIndex(params.get("v")) : null;
  if (params.has("v") && video === null) return null;
  const ss = params.get("ss") ?? "0";
  if (!SECONDS.test(ss)) return null;
  return { source: file.rootId, segments: file.segments, video, audio, startS: Number(ss) };
}

/** A grant token has a root id's shape: 128 random bits. */
export const isGrantToken = isRootId;

/**
 * Added to the start time. The worker asks for a keyframe's own timestamp,
 * and ffmpeg seeks to the keyframe at or before `-ss`: rounded to a
 * microsecond the request could fall just short of its keyframe and land a
 * whole group of pictures early. Half a millisecond late always finds it.
 */
export const SEEK_NUDGE_S = 0.0005;

/**
 * ffmpeg's arguments for one job: the chosen tracks from `input`, video
 * copied, audio to stereo AAC, fragmented MP4 on stdout.
 *
 * - `file:` and the protocol whitelist keep ffmpeg to local files, whatever
 *   the file's contents ask for (a playlist naming a URL, say).
 * - `-seek_timestamp 1` makes `-ss` the file's own timestamp, not an offset
 *   from its start; before `-i` it seeks the input, and the output's clock
 *   starts at 0 there. The worker lines that 0 up with its own timeline.
 * - `V` is video that isn't cover art, so an attached picture never shifts the count.
 */
export function transcodeArgs(input: string, req: Pick<TranscodeRequest, "video" | "audio" | "startS">): string[] {
  const hasVideo = req.video !== null;
  return [
    "-hide_banner",
    "-nostdin",
    "-loglevel",
    "error",
    "-protocol_whitelist",
    "file",
    "-seek_timestamp",
    "1",
    "-ss",
    (req.startS + SEEK_NUDGE_S).toFixed(6),
    "-i",
    `file:${input}`,
    ...(hasVideo ? ["-map", `0:V:${String(req.video)}`] : []),
    "-map",
    `0:a:${String(req.audio)}`,
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-ac",
    "2",
    "-b:a",
    "192k",
    "-sn",
    "-dn",
    "-map_metadata",
    "-1",
    "-map_chapters",
    "-1",
    "-movflags",
    // With video, a fragment per keyframe; audio alone has none to cut on, so one a second.
    hasVideo ? "+frag_keyframe+empty_moov+default_base_moof" : "+empty_moov+default_base_moof",
    ...(hasVideo ? [] : ["-frag_duration", "1000000"]),
    "-f",
    "mp4",
    "pipe:1",
  ];
}

/**
 * Which of AUDIO_DECODERS' codecs this build decodes, from `ffmpeg -decoders`
 * (lines like ` A....D ac3   ATSC A/52A (AC-3)`). Empty unless it can also
 * encode AAC (`ffmpeg -encoders`, the same shape).
 */
export function transcodableFrom(decoders: string, encoders: string): string[] {
  const names = (text: string) => new Set([...text.matchAll(/^[ \t]*A[A-Z.]{5}[ \t]+([^ \t\r\n]+)/gm)].map((m) => m[1]));
  if (!names(encoders).has("aac")) return [];
  const have = names(decoders);
  return Object.entries(AUDIO_DECODERS)
    .filter(([, decoder]) => have.has(decoder))
    .map(([codec]) => codec);
}

/** Jobs running at once at most: the one playing, and one a seek has just replaced. */
export const MAX_JOBS = 2;

/** One-file grants kept at most (this run only). */
export const MAX_GRANTS = 32;
