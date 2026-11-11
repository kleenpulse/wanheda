// The media worker (V52–V54, ADR-0013): one per opened local file.
// - open: quick fingerprint + a header-only probe with Mediabunny.
// - remux: Mediabunny copies the chosen tracks (never re-encodes:
//   `copy: { mode: "forced" }`) into fragmented MP4, appended to a
//   MediaSource that lives here; the page plays it through `MediaSource.handle`.
//   Memory stays bounded: ≤ 30 s ahead of the clock, > 20 s behind removed.
//   A seek past what's buffered restarts from the keyframe at or before it.
// - thumb: one frame (at a share of the length) decoded with WebCodecs onto
//   an OffscreenCanvas, sent back as an image for the library's cards (T72).
// - transcode (desktop, V74): the same MSE source, fed by the shell's ffmpeg
//   stream (video copied, audio as AAC) instead of Mediabunny; a restart asks
//   ffmpeg to start from the keyframe.
// Nothing remuxed or converted is stored.

import { ALL_FORMATS, BlobSource, CanvasSink, Conversion, EncodedPacketSink, Input, Mp4OutputFormat, Output, StreamTarget, UrlSource, type InputTrack, type StreamTargetChunk } from "mediabunny";
import { AHEAD_S, BEHIND_S, type EngineRequest, type EngineResponse } from "./engine-protocol";
import { quickFingerprint, urlReader } from "./fingerprint";
import { JobSlot, needsRestart, rangeAt, restartFrom, toRanges, type Range, type RemuxJob } from "./remux-plan";
import type { Probe, ProbeTrack } from "./ladder";

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<EngineRequest>) => void) | null;
  postMessage: (message: EngineResponse, transfer?: Transferable[]) => void;
};

let input: Input | null = null;
let tracks: InputTrack[] = [];
let durationS: number | null = null;

let mediaSource: MediaSource | null = null;
let buffer: SourceBuffer | null = null;
let chosen: { video: number | null; audio: number | null } = { video: null, audio: null };
/** Set when the bytes come from the desktop shell's ffmpeg (V74), not from Mediabunny. */
let transcodeUrl: string | null = null;
const TRANSCODE_PREFIX = "wanheda-transcode://";
/** What the shell's ffmpeg makes of any audio track: AAC-LC. */
const AAC_LC = "mp4a.40.2";
let clock = 0;
let tick: (() => void) | null = null;

const post = (m: EngineResponse, transfer?: Transferable[]) => {
  scope.postMessage(m, transfer);
};
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function probeTracks(): Promise<ProbeTrack[]> {
  const out: ProbeTrack[] = [];
  for (const t of tracks) {
    if (t.type !== "video" && t.type !== "audio") continue;
    const [codec, codecString, disposition, language, name] = await Promise.all([
      t.getCodec(),
      t.getCodecParameterString().catch(() => null),
      t.getDisposition(),
      t.getLanguageCode(),
      t.getName(),
    ]);
    out.push({
      id: t.id,
      kind: t.type,
      codec,
      codecString,
      isDefault: disposition.default,
      language: language && language !== "und" ? language : null,
      name,
    });
  }
  return out;
}

/** A URL source gives up after two tries: a missing native file mustn't retry forever. */
const URL_RETRY = (attempts: number) => (attempts < 2 ? 0.5 : null);

async function open(file: File | { url: string; size: number }): Promise<void> {
  const isUrl = !(file instanceof File);
  const fpTask = quickFingerprint(isUrl ? urlReader(file.url, file.size) : file);
  let probe: Probe | null = null;
  let probeError: string | null = null;
  try {
    input = new Input({ source: isUrl ? new UrlSource(file.url, { getRetryDelay: URL_RETRY }) : new BlobSource(file), formats: ALL_FORMATS });
    const format = await input.getFormat();
    tracks = await input.getTracks();
    durationS = (await input.getDurationFromMetadata().catch(() => null)) ?? (await input.computeDuration().catch(() => null));
    probe = { format: format.name, mime: format.mimeType, durationS, tracks: await probeTracks() };
  } catch (e) {
    // Mediabunny can't read it; the page may still try the browser on its own.
    probeError = message(e);
    input = null;
  }
  try {
    post({ type: "opened", fp: await fpTask, probe, probeError });
  } catch (e) {
    post({ type: "open-failed", message: message(e) });
  }
}

// --- remux -------------------------------------------------------------
// One timeline: element time = source time − `base`, the chosen tracks'
// first timestamp (an MPEG-TS often starts near 1.4 s). Every job, the first
// and each restart, trims from an explicit source time and sets
// `timestampOffset` to its element time, so restarts line up exactly.

let base = 0;
const slot = new JobSlot();

const waitIdle = (sb: SourceBuffer) =>
  sb.updating
    ? new Promise<void>((resolve) => {
        sb.addEventListener(
          "updateend",
          () => {
            resolve();
          },
          { once: true },
        );
      })
    : Promise.resolve();

const ranges = (): Range[] => (buffer ? toRanges(buffer.buffered) : []);
const endS = (): number | null => (durationS === null ? null : Math.max(0, durationS - base));

function bufferedEnd(at: number): number {
  return rangeAt(ranges(), at)?.[1] ?? at;
}

async function evict(): Promise<void> {
  if (!buffer || mediaSource?.readyState !== "open") return;
  const r = buffer.buffered;
  if (r.length === 0) return;
  const cut = clock - BEHIND_S;
  if (r.start(0) < cut - 1) {
    await waitIdle(buffer);
    buffer.remove(0, cut);
    await waitIdle(buffer);
  }
}

async function append(data: Uint8Array<ArrayBuffer>, current: RemuxJob): Promise<void> {
  if (!buffer || current.cancelled) throw new Error("cancelled");
  await waitIdle(buffer);
  // Rechecked after the wait: a newer job may have set its offset meanwhile.
  if (isCancelled(current)) throw new Error("cancelled");
  try {
    buffer.appendBuffer(data);
  } catch (e) {
    if (!(e instanceof DOMException && e.name === "QuotaExceededError")) throw e;
    await evict();
    await waitIdle(buffer);
    if (isCancelled(current)) throw new Error("cancelled");
    buffer.appendBuffer(data);
  }
  await waitIdle(buffer);
}

/** Read through a call: a seek or close flips it while a job awaits. */
const isCancelled = (j: RemuxJob) => j.cancelled;

/** Wait while the buffer is ≥ 30 s ahead of the clock (back-pressure into the conversion). */
async function throttle(current: RemuxJob, startS: number): Promise<void> {
  while (!isCancelled(current) && bufferedEnd(Math.max(clock, startS)) - Math.max(clock, startS) > AHEAD_S) {
    await new Promise<void>((resolve) => {
      tick = resolve;
      setTimeout(resolve, 500);
    });
    await evict();
  }
}

/** Starts a job at the keyframe at or before element time `target`. */
async function startAt(target: number): Promise<void> {
  if (!input || !buffer || !mediaSource) return;
  tick?.();
  const current = await slot.replace(target);
  if (isCancelled(current)) return;

  const video = tracks.find((t) => t.id === chosen.video && t.isVideoTrack());
  const wanted = base + Math.max(0, target);
  const key = video ? await new EncodedPacketSink(video).getKeyPacket(wanted, { metadataOnly: true }).catch(() => null) : null;
  const sourceStart = Math.max(base, key?.timestamp ?? wanted);
  const startS = sourceStart - base;
  current.from = Math.min(current.from, startS);

  await waitIdle(buffer);
  if (isCancelled(current)) return;
  if (mediaSource.readyState === "open") buffer.abort();
  buffer.timestampOffset = startS;

  if (transcodeUrl) {
    await pump(transcodeUrl, sourceStart, startS, current);
    return;
  }

  let first = true;
  const writable = new WritableStream<StreamTargetChunk>({
    write: async (chunk) => {
      await append(chunk.data, current);
      if (first) {
        first = false;
        post({ type: "appended", startS });
      }
      await evict();
      await throttle(current, startS);
    },
  });

  try {
    const output = new Output({
      format: new Mp4OutputFormat({
        fastStart: "fragmented",
        minimumFragmentDuration: 1,
        onMoof: (_data, _position, timestamp) => {
          current.head = startS + timestamp;
        },
      }),
      target: new StreamTarget(writable),
    });
    const conversion = await Conversion.init({
      input,
      output,
      video: (t) => (t.id === chosen.video ? {} : { discard: true }),
      audio: (t) => (t.id === chosen.audio ? {} : { discard: true }),
      copy: { mode: "forced" },
      trim: { start: sourceStart },
      showWarnings: false,
    });
    current.cancel = () => conversion.cancel();
    if (isCancelled(current)) {
      await conversion.cancel().catch(() => undefined);
      return;
    }
    if (!conversion.isValid) throw new Error("No track could be copied without converting it.");
    await conversion.execute();
    if (isCancelled(current) || slot.current !== current) return;
    await waitIdle(buffer);
    if (mediaSource.readyState === "open") mediaSource.endOfStream();
    post({ type: "remux-ended" });
  } catch (e) {
    if (isCancelled(current)) return;
    post({ type: "remux-failed", message: message(e) });
  }
}

/** One ffmpeg stream from the shell into the buffer, starting at source time `sourceStart` (a keyframe), which lands at element time `startS`. */
async function pump(url: string, sourceStart: number, startS: number, current: RemuxJob): Promise<void> {
  const abort = new AbortController();
  // Aborting the fetch is the cancel: the shell kills ffmpeg when its reader goes away.
  current.cancel = () => {
    abort.abort();
    return Promise.resolve();
  };
  try {
    if (isCancelled(current)) return;
    const res = await fetch(`${url}&ss=${sourceStart.toFixed(6)}`, { signal: abort.signal, cache: "no-store" });
    if (!res.ok || !res.body) throw new Error("The converter couldn't read this file.");
    const reader = res.body.getReader();
    let got = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength === 0) continue;
      await append(value, current);
      if (!got) {
        got = true;
        post({ type: "appended", startS });
      }
      // The newest fragment's end: the end of the range this job is writing.
      current.head = rangeAt(ranges(), current.head === null ? startS : current.head - 0.05)?.[1] ?? current.head;
      await evict();
      await throttle(current, startS);
    }
    if (isCancelled(current) || slot.current !== current) return;
    if (!got) throw new Error("The converter made nothing from this file.");
    if (buffer && mediaSource) {
      await waitIdle(buffer);
      if (mediaSource.readyState === "open") mediaSource.endOfStream();
    }
    post({ type: "remux-ended" });
  } catch (e) {
    if (isCancelled(current)) return;
    post({ type: "remux-failed", message: message(e) });
  }
}

async function remux(video: number | null, audio: number | null, viaUrl: string | null = null): Promise<void> {
  if (!input) {
    post({ type: "remux-failed", message: "The file isn't open." });
    return;
  }
  const MS = self as unknown as { MediaSource?: typeof MediaSource & { canConstructInDedicatedWorker?: boolean } };
  if (!MS.MediaSource?.canConstructInDedicatedWorker) {
    post({ type: "remux-failed", message: "This browser can't stream a converted file from a worker." });
    return;
  }
  if (viaUrl !== null && !viaUrl.startsWith(TRANSCODE_PREFIX)) {
    post({ type: "remux-failed", message: "That isn't the converter's address." });
    return;
  }
  transcodeUrl = viaUrl;
  chosen = { video, audio };
  const picked = tracks.filter((t) => t.id === video || t.id === audio);
  // Converted audio is always AAC; a copied track keeps its own codec string.
  const strings = await Promise.all(picked.map((t) => (viaUrl !== null && t.id === audio ? Promise.resolve(AAC_LC) : t.getCodecParameterString().catch(() => null))));
  if (strings.some((s) => !s)) {
    post({ type: "remux-failed", message: "A track's codec string is unknown." });
    return;
  }
  base = Math.max(0, await input.getFirstTimestamp(picked).catch(() => 0));
  const mime = `${video === null ? "audio" : "video"}/mp4; codecs="${strings.join(", ")}"`;

  const ms = new MS.MediaSource();
  mediaSource = ms;
  ms.addEventListener(
    "sourceopen",
    () => {
      try {
        const end = endS();
        if (end) ms.duration = end;
        buffer = ms.addSourceBuffer(mime);
        buffer.mode = "segments";
      } catch (e) {
        post({ type: "remux-failed", message: message(e) });
        return;
      }
      void startAt(0);
    },
    { once: true },
  );
  const handle = (ms as unknown as { handle: Transferable }).handle;
  post({ type: "handle", handle }, [handle]);
}

/** A seek, or a stall (`waiting`): restart unless `t` is in a range still being written or complete to the end. */
async function seek(t: number): Promise<void> {
  clock = t;
  tick?.();
  if (!buffer) return;
  const now = ranges();
  if (!needsRestart(now, t, slot.current, endS())) return;
  await startAt(restartFrom(now, t));
}

// --- thumb -------------------------------------------------------------

/** One frame at `at` (0..1 of the length), `width` px wide; null when there is no decodable picture. */
async function thumb(at: number, width: number): Promise<void> {
  try {
    const track = input ? await input.getPrimaryVideoTrack() : null;
    if (!track || !(await track.canDecode())) {
      post({ type: "thumb", blob: null });
      return;
    }
    const first = await track.getFirstTimestamp();
    const length = durationS ?? (await track.computeDuration());
    const sink = new CanvasSink(track, { width: Math.min(width, (await track.getDisplayWidth()) || width) });
    const frame = (await sink.getCanvas(first + Math.max(0, Math.min(1, at)) * length)) ?? (await sink.getCanvas(first));
    const canvas = frame?.canvas;
    if (!canvas || !("convertToBlob" in canvas)) {
      post({ type: "thumb", blob: null });
      return;
    }
    // Safari answers a WebP request with a PNG: the page keeps whatever type comes back.
    post({ type: "thumb", blob: await canvas.convertToBlob({ type: "image/webp", quality: 0.8 }) });
  } catch {
    post({ type: "thumb", blob: null });
  }
}

scope.onmessage = (event) => {
  const m = event.data;
  switch (m.type) {
    case "open":
      void open(m.file);
      break;
    case "open-url":
      void open({ url: m.url, size: m.size });
      break;
    case "remux":
      void remux(m.video, m.audio);
      break;
    case "transcode":
      void remux(m.video, m.audio, m.url);
      break;
    case "time":
      clock = m.t;
      tick?.();
      break;
    case "seek":
      void seek(m.t);
      break;
    case "thumb":
      void thumb(m.at, m.width);
      break;
    case "close":
      tick?.();
      void slot.clear().finally(() => {
        input?.dispose();
        self.close();
      });
      break;
  }
};
