// The browser's media abilities (V52) and the client for the media worker
// (V53, V54). The ladder in lib/media/ladder.ts stays pure; this file asks
// the browser the questions it needs answered. Phase 8's desktop shell can
// answer them differently (native transcode) behind the same shape.

import type { EngineRequest, EngineResponse } from "@/lib/media/engine-protocol";
import type { PlaybackCaps, Probe, ProbeTrack } from "@/lib/media/ladder";

export type CapsDeps = {
  canPlayType: (type: string) => string;
  isTypeSupported: (type: string) => boolean;
  workerMse: boolean;
};

/** PCM in WAV|AIFF plays natively but has no RFC 6381 string to ask about. */
const PCM = /^(pcm-|ulaw$|alaw$)/;

export function trackCaps(probe: Probe, t: ProbeTrack, deps: CapsDeps): { native: boolean; remux: boolean } {
  const cs = t.codecString;
  if (!cs) return { native: t.codec !== null && PCM.test(t.codec) && deps.canPlayType(probe.mime) !== "", remux: false };
  const mp4 = `${t.kind}/mp4; codecs="${cs}"`;
  const remux = deps.isTypeSupported(mp4);
  // Any of: the browser plays the codec in this container, or decodes it at all
  // (MSE accepts it in MP4|WebM). An AC3 track fails every one (T60).
  const native = deps.canPlayType(`${probe.mime}; codecs="${cs}"`) !== "" || remux || deps.isTypeSupported(`${t.kind}/webm; codecs="${cs}"`);
  return { native, remux };
}

export function capsFrom(probe: Probe, deps: CapsDeps): PlaybackCaps {
  const tracks: Record<number, { native: boolean; remux: boolean }> = {};
  for (const t of probe.tracks) tracks[t.id] = trackCaps(probe, t, deps);
  return { container: deps.canPlayType(probe.mime) !== "", tracks, workerMse: deps.workerMse, transcodable: [] };
}

/** The live browser's answers, asked through a real `<video>` element. */
export function browserCapsDeps(video: HTMLVideoElement): CapsDeps {
  const MS = typeof MediaSource === "undefined" ? null : (MediaSource as typeof MediaSource & { canConstructInDedicatedWorker?: boolean });
  return {
    canPlayType: (type) => video.canPlayType(type),
    isTypeSupported: (type) => MS?.isTypeSupported(type) ?? false,
    workerMse: MS?.canConstructInDedicatedWorker === true,
  };
}

export type Opened = { fp: string; probe: Probe | null; probeError: string | null };

type Listener = (m: EngineResponse) => void;

/**
 * One media worker per opened local file. `open` fingerprints and probes;
 * `remux` hands back the MSE handle for the element's `srcObject`. `close`
 * ends the worker and everything it buffered.
 */
export class MediaEngine {
  private worker: Worker | null;
  private listeners = new Set<Listener>();

  constructor() {
    this.worker = new Worker(new URL("../media/engine.worker.ts", import.meta.url), { type: "module", name: "media-engine" });
    this.worker.onmessage = (e: MessageEvent<EngineResponse>) => {
      for (const l of [...this.listeners]) l(e.data);
    };
    this.worker.onerror = (e) => {
      e.preventDefault();
      for (const l of [...this.listeners]) l({ type: "remux-failed", message: "The media worker stopped." });
    };
  }

  private send(m: EngineRequest): void {
    this.worker?.postMessage(m);
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  open(file: File): Promise<Opened> {
    return new Promise((resolve, reject) => {
      const off = this.on((m) => {
        if (m.type === "opened") {
          off();
          resolve({ fp: m.fp, probe: m.probe, probeError: m.probeError });
        } else if (m.type === "open-failed" || m.type === "remux-failed") {
          off();
          reject(new Error(m.type === "open-failed" ? m.message : m.message));
        }
      });
      this.send({ type: "open", file });
    });
  }

  /** Starts the remux; resolves with the handle to set as `srcObject`. */
  remux(video: number | null, audio: number | null): Promise<MediaProvider> {
    return new Promise((resolve, reject) => {
      const off = this.on((m) => {
        if (m.type === "handle") {
          off();
          resolve(m.handle as MediaProvider);
        } else if (m.type === "remux-failed") {
          off();
          reject(new Error(m.message));
        }
      });
      this.send({ type: "remux", video, audio });
    });
  }

  time(t: number): void {
    this.send({ type: "time", t });
  }

  seek(t: number): void {
    this.send({ type: "seek", t });
  }

  close(): void {
    this.send({ type: "close" });
    const w = this.worker;
    this.worker = null;
    this.listeners.clear();
    // The worker closes itself after cancelling; this is the backstop.
    if (w)
      setTimeout(() => {
        w.terminate();
      }, 2000);
  }
}
