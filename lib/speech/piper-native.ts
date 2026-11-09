import { abortError, isAbort, type SynthOptions, type SynthResult } from "./engine";
import { readVoiceFiles } from "./voices";
import { desktopBridge } from "@/lib/platform/desktop";

// Native Piper, page side (SPEC V73): on the desktop app, the queue's audio
// comes from sherpa-onnx in the shell's own process (≈ 3.5× faster than WASM,
// ADR-0014). Phonemes are made here, in a small worker (no onnxruntime), and
// the voice is the one this device already downloaded: handed to the shell
// once, which checks it against the catalog again. Any failure but a stop
// marks the native path broken for this session, and the caller falls back
// to WASM Piper, so speech never goes silent.

type Waiting = { resolve: (codepoints: number[]) => void; reject: (e: Error) => void };

class NativePiper {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly waiting = new Map<number, Waiting>();
  /** Voices the shell has, and installs in flight. */
  private readonly ready = new Map<string, Promise<void>>();
  private broken: string | null = null;

  /** On the desktop app, unless it failed this session. */
  usable(): boolean {
    return this.broken === null && desktopBridge() !== null;
  }

  /** Why the native path stopped this session, for the exit log; null while it works. */
  get failure(): string | null {
    return this.broken;
  }

  /** After a failure: WASM Piper takes over until the app reloads. */
  broke(error: unknown): void {
    this.broken ??= error instanceof Error ? error.message : String(error);
  }

  /** Makes sure the shell has the voice, handing over this device's copy the first time. */
  warm(voice: string): Promise<void> {
    const known = this.ready.get(voice);
    if (known) return known;
    const job = (async () => {
      const tts = desktopBridge()?.tts;
      if (!tts) throw new Error("Native speech is only in the desktop app.");
      if (await tts.has(voice)) return;
      const files = await readVoiceFiles(voice);
      if (!files) throw new Error(`voice ${voice} is not on this device`);
      const ok = await tts.install(voice, await files.model.arrayBuffer(), await files.config.text());
      if (!ok) throw new Error(`voice ${voice} didn't match the catalog`);
    })();
    // A failed hand-over isn't remembered: the next try starts again.
    job.catch(() => {
      if (this.ready.get(voice) === job) this.ready.delete(voice);
    });
    this.ready.set(voice, job);
    return job;
  }

  /** The voice was deleted: the shell forgets its copy too. */
  drop(voice: string): void {
    this.ready.delete(voice);
    void desktopBridge()?.tts.drop(voice).catch(() => undefined);
  }

  async synth(text: string, voice: string, { rate, signal }: SynthOptions): Promise<SynthResult> {
    // Read fresh after each await: a stop can land at any of them.
    const stopped = () => signal.aborted;
    if (stopped()) throw abortError();
    const tts = desktopBridge()?.tts;
    if (!tts) throw new Error("Native speech is only in the desktop app.");
    await this.warm(voice);
    const codepoints = await this.phonemes(voice, text);
    if (stopped()) throw abortError();
    if (codepoints.length === 0) return { samples: new Float32Array(0), sampleRate: 22050, synthMs: 0 };
    const out = await tts.synth(voice, codepoints, rate);
    // The shell can't drop a sentence mid-synth: a stop just ignores what comes back.
    if (stopped()) throw abortError();
    return { samples: new Float32Array(out.samples), sampleRate: out.sampleRate, synthMs: out.synthMs };
  }

  private phonemes(voice: string, text: string): Promise<number[]> {
    this.worker ??= this.spawn();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      this.worker?.postMessage({ id, voice, text });
    });
  }

  private spawn(): Worker {
    const w = new Worker(new URL("./phoneme.worker.ts", import.meta.url), { type: "module", name: "phonemes" });
    w.onmessage = (e: MessageEvent<{ id: number; ok: boolean; codepoints?: number[]; error?: string }>) => {
      const waiting = this.waiting.get(e.data.id);
      if (!waiting) return;
      this.waiting.delete(e.data.id);
      if (e.data.ok && e.data.codepoints) waiting.resolve(e.data.codepoints);
      else waiting.reject(new Error(e.data.error ?? "phonemes failed"));
    };
    w.onerror = (e) => {
      e.preventDefault();
      for (const waiting of this.waiting.values()) waiting.reject(new Error("The phoneme worker stopped."));
      this.waiting.clear();
      this.worker = null;
    };
    return w;
  }
}

export const nativePiper = new NativePiper();

/**
 * Audio for a sentence: native Piper on the desktop app while it works, else
 * (or after it fails, for the rest of the session) `fallback`, WASM Piper.
 */
export function synthPreferNative(text: string, voice: string, opts: SynthOptions, fallback: () => Promise<SynthResult>): Promise<SynthResult> {
  if (!nativePiper.usable()) return fallback();
  return nativePiper.synth(text, voice, opts).catch((e: unknown) => {
    if (isAbort(e)) throw e;
    nativePiper.broke(e);
    return fallback();
  });
}
