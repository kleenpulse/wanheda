/// <reference lib="webworker" />
// The memory tracker must wrap WebAssembly.Memory before the runtime makes its heap.
import { wasmBytes } from "./wasm-memory";
import * as ort from "onnxruntime-web/wasm";
import { phonemize } from "phonemizer";
import { parseVoiceConfig, phonemeIds, textToPhonemes, type PiperVoiceConfig } from "./piper-ids";
import type { PiperRequest, PiperResponse } from "./piper-protocol";
import { readVoiceFiles } from "./voices";

// Piper in a Web Worker (SPEC V45, ADR-0012): onnxruntime-web 1.31.1 runs the
// voice model, `phonemizer` (espeak-ng) makes its phonemes. Only
// `ort.wasm.min.mjs` (aliased in next.config.ts) and
// `ort-wasm-simd-threaded.{mjs,wasm}` load, all from this origin. Threads
// switch on by header alone: without cross-origin isolation, one thread.

declare const self: DedicatedWorkerGlobalScope;

ort.env.wasm.proxy = false;
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
ort.env.wasm.wasmPaths = {
  mjs: new URL("onnxruntime-web/ort-wasm-simd-threaded.mjs", import.meta.url),
  wasm: new URL("onnxruntime-web/ort-wasm-simd-threaded.wasm", import.meta.url),
};

interface Loaded {
  voice: string;
  session: ort.InferenceSession;
  config: PiperVoiceConfig;
}

let loaded: Loaded | null = null;
let chain: Promise<void> = Promise.resolve();
const cancelled = new Set<number>();

const post = (msg: PiperResponse, transfer: Transferable[] = []) => {
  self.postMessage(msg, transfer);
};
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function load(voice: string): Promise<Loaded> {
  if (loaded?.voice === voice) return loaded;
  const files = await readVoiceFiles(voice);
  if (!files) throw new Error(`voice ${voice} is not on this device`);
  const config = parseVoiceConfig(JSON.parse(await files.config.text()));
  if (!config) throw new Error(`voice ${voice} has a config Piper can't run`);
  const model = new Uint8Array(await files.model.arrayBuffer());
  if (loaded) await loaded.session.release();
  loaded = null;
  const session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
  loaded = { voice, session, config };
  return loaded;
}

async function synth(req: Extract<PiperRequest, { type: "synth" }>): Promise<void> {
  if (cancelled.delete(req.id)) {
    post({ type: "pcm", id: req.id, ok: false, error: "cancelled", cancelled: true });
    return;
  }
  const { session, config } = await load(req.voice);
  const t0 = performance.now();
  const phonemes = await textToPhonemes(req.text, (t) => phonemize(t, config.espeak.voice));
  const ids = phonemeIds(phonemes, config.phoneme_id_map);
  const inf = config.inference;
  const feeds: Record<string, ort.Tensor> = {
    input: new ort.Tensor("int64", BigInt64Array.from(ids, BigInt), [1, ids.length]),
    input_lengths: new ort.Tensor("int64", BigInt64Array.from([BigInt(ids.length)]), [1]),
    // Speed is the length scale: slower speech is longer, with no pitch shift.
    scales: new ort.Tensor("float32", Float32Array.from([inf.noise_scale, inf.length_scale / req.rate, inf.noise_w]), [3]),
  };
  if (config.num_speakers > 1) feeds.sid = new ort.Tensor("int64", BigInt64Array.from([0n]), [1]);
  const out = await session.run(feeds);
  const output = out.output ?? Object.values(out)[0];
  if (!output) throw new Error("Piper returned no audio");
  // A copy the page can own (the tensor may sit on the runtime's heap).
  const samples = new Float32Array(output.data as Float32Array);
  const synthMs = performance.now() - t0;
  output.dispose();
  cancelled.delete(req.id);
  post({ type: "pcm", id: req.id, ok: true, samples, sampleRate: config.audio.sample_rate, synthMs, wasmBytes: wasmBytes() }, [samples.buffer]);
}

self.onmessage = (e: MessageEvent<PiperRequest>) => {
  const req = e.data;
  if (req.type === "cancel") {
    cancelled.add(req.id);
    return;
  }
  if (req.type === "drop") {
    // The voice was deleted: free its model once the work ahead of this is done.
    chain = chain.then(async () => {
      if (loaded?.voice !== req.voice) return;
      const { session } = loaded;
      loaded = null;
      await session.release().catch(() => undefined);
    });
    return;
  }
  chain = chain.then(async () => {
    if (req.type === "load") {
      const t0 = performance.now();
      try {
        await load(req.voice);
        post({ type: "loaded", voice: req.voice, ok: true, ms: performance.now() - t0, wasmBytes: wasmBytes() });
      } catch (error) {
        post({ type: "loaded", voice: req.voice, ok: false, error: message(error) });
      }
      return;
    }
    try {
      await synth(req);
    } catch (error) {
      cancelled.delete(req.id);
      post({ type: "pcm", id: req.id, ok: false, error: message(error), cancelled: false });
    }
  });
};
