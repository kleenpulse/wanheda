import { abortError, type PcmEngine, type SynthOptions, type SynthResult, type VoiceInfo } from "./engine";
import type { PiperRequest, PiperResponse } from "./piper-protocol";
import { CATALOG, isInstalled } from "./voices";

// The Piper engine, page side (SPEC V45, ADR-0012). The worker (and its
// 150–600 MB of wasm) lives only while it's wanted:
//
// - A reader open on a pdf|md|txt document holds it, and pre-warms the voice
//   at idle (prewarm.ts), so pressing play doesn't wait ≈ 2–3 s for a load.
// - Speech holds it.
// - With no hold left it is released after IDLE_RELEASE_MS.
// - Its wasm memory only grows, so past RECYCLE_BYTES it is replaced between
//   units. The replacement loads the voice while queued audio plays.

const IDLE_RELEASE_MS = 3 * 60_000;
const RECYCLE_BYTES = 400 * 1024 * 1024;

interface Waiting {
  resolve: (r: SynthResult) => void;
  reject: (e: unknown) => void;
}

class PiperEngine implements PcmEngine {
  readonly kind = "pcm";
  readonly id = "piper";
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly waiting = new Map<number, Waiting>();
  /** Voice loads asked of the current worker. */
  private loads = new Map<string, { promise: Promise<void>; settle: (error: string | null) => void }>();
  private lastVoice: string | null = null;
  private recycleDue = false;
  private holds = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  /** The worker's wasm memory at its last reply, in bytes (0: no worker, or the runtime's heap wasn't seen). For the exit log. */
  wasmBytes = 0;

  async voices(): Promise<VoiceInfo[]> {
    const here = await Promise.all(CATALOG.map(async (v) => ((await isInstalled(v.id)) ? v : null)));
    return here.filter((v) => v !== null).map((v) => ({ id: v.id, name: v.name, lang: v.lang }));
  }

  /** Loads a voice so the next synth starts at once. Resolves when loaded; rejects when the voice can't load. */
  warm(voice: string): Promise<void> {
    this.lastVoice = voice;
    const w = this.ensureWorker();
    const known = this.loads.get(voice);
    if (known) return known.promise;
    let settle!: (error: string | null) => void;
    const promise = new Promise<void>((resolve, reject) => {
      settle = (error) => {
        if (error === null) resolve();
        else reject(new Error(error));
      };
    });
    // A failed load isn't remembered: the next warm tries again.
    promise.catch(() => {
      if (this.loads.get(voice)?.promise === promise) this.loads.delete(voice);
    });
    this.loads.set(voice, { promise, settle });
    w.postMessage({ type: "load", voice } satisfies PiperRequest);
    return promise;
  }

  synth(text: string, voice: string, { rate, signal }: SynthOptions): Promise<SynthResult> {
    if (signal.aborted) return Promise.reject(abortError());
    this.lastVoice = voice;
    const w = this.ensureWorker();
    const id = this.nextId++;
    return new Promise<SynthResult>((resolve, reject) => {
      const onAbort = () => {
        if (!this.waiting.delete(id)) return;
        this.worker?.postMessage({ type: "cancel", id } satisfies PiperRequest);
        reject(abortError());
        this.maybeRecycle();
      };
      signal.addEventListener("abort", onAbort, { once: true });
      this.waiting.set(id, {
        resolve: (r) => {
          signal.removeEventListener("abort", onAbort);
          resolve(r);
        },
        reject: (e) => {
          signal.removeEventListener("abort", onAbort);
          reject(e);
        },
      });
      w.postMessage({ type: "synth", id, voice, text, rate } satisfies PiperRequest);
    });
  }

  /** A reader (or speech) wants the engine kept. Returns the release. */
  hold(): () => void {
    this.holds++;
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.holds--;
      if (this.holds === 0) this.idleTimer = setTimeout(() => this.release(), IDLE_RELEASE_MS);
    };
  }

  /** Ends the worker now; anything pending is rejected. */
  release(): void {
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    const w = this.worker;
    this.worker = null;
    w?.terminate();
    this.wasmBytes = 0;
    for (const { reject } of this.waiting.values()) reject(abortError());
    this.waiting.clear();
    for (const { settle } of this.loads.values()) settle("speech engine released");
    this.loads = new Map();
    this.recycleDue = false;
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL("./piper.worker.ts", import.meta.url), { type: "module", name: "speech-piper" });
    w.onmessage = (e: MessageEvent<PiperResponse>) => {
      if (this.worker === w) this.receive(e.data);
    };
    w.onerror = (e) => {
      e.preventDefault();
      if (this.worker !== w) return;
      const error = new Error(e.message || "speech engine crashed");
      this.worker = null;
      w.terminate();
      for (const { reject } of this.waiting.values()) reject(error);
      this.waiting.clear();
      for (const { settle } of this.loads.values()) settle(error.message);
      this.loads = new Map();
    };
    this.worker = w;
    return w;
  }

  private receive(msg: PiperResponse): void {
    if (msg.type === "loaded") {
      this.loads.get(msg.voice)?.settle(msg.ok ? null : msg.error);
      if (msg.ok) this.wasmBytes = msg.wasmBytes;
      if (msg.ok && msg.wasmBytes > RECYCLE_BYTES) this.recycleDue = true;
      return;
    }
    const waiting = this.waiting.get(msg.id);
    this.waiting.delete(msg.id);
    if (msg.ok) {
      this.wasmBytes = msg.wasmBytes;
      if (msg.wasmBytes > RECYCLE_BYTES) this.recycleDue = true;
      waiting?.resolve({ samples: msg.samples, sampleRate: msg.sampleRate, synthMs: msg.synthMs });
    } else if (!msg.cancelled) {
      waiting?.reject(new Error(msg.error));
    }
    this.maybeRecycle();
  }

  /** Between units only: once nothing is pending, a fresh worker replaces this one and loads the voice again. */
  private maybeRecycle(): void {
    if (!this.recycleDue || this.waiting.size > 0) return;
    const voice = this.lastVoice;
    this.release();
    if (voice && this.holds > 0) void this.warm(voice).catch(() => undefined);
  }
}

export const piper = new PiperEngine();
