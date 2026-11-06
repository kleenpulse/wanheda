// Messages between the page and the Piper worker (lib/speech/piper.worker.ts).
// The worker runs one request at a time, in arrival order.

export type PiperRequest =
  /** Load a voice now (pre-warm, V45). */
  | { type: "load"; voice: string }
  | { type: "synth"; id: number; voice: string; text: string; rate: number }
  /** Drop a synth request that hasn't started; one already running finishes and its result is ignored. */
  | { type: "cancel"; id: number }
  /** The voice was deleted (V46): free its model if it's the one loaded. */
  | { type: "drop"; voice: string };

export type PiperResponse =
  | { type: "loaded"; voice: string; ok: true; ms: number; wasmBytes: number }
  | { type: "loaded"; voice: string; ok: false; error: string }
  | {
      type: "pcm";
      id: number;
      ok: true;
      samples: Float32Array<ArrayBuffer>;
      sampleRate: number;
      /** Phonemize + inference, without any model load. */
      synthMs: number;
      /** The worker's wasm memory after this request: it only grows, so the page recycles the worker past a limit. */
      wasmBytes: number;
    }
  | { type: "pcm"; id: number; ok: false; error: string; cancelled: boolean };
