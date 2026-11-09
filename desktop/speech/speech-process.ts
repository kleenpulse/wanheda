/*
 * Native Piper (SPEC V73, ADR-0014): sherpa-onnx in its own utility process,
 * so a crash or a runaway model never takes the window or the server down.
 * Main sends a voice's files (the derived model and tokens.txt it wrote after
 * checking the catalog digests) and phonemes as code points; this answers
 * with mono PCM. No network, ever.
 *
 * Bundled to `speech/wanheda-speech.cjs`; `sherpa-onnx-node` and its platform
 * package sit next to it in `speech/node_modules` (not bundled: native).
 */

type Voice = { voice: string; modelPath: string; tokensPath: string; noiseScale: number; noiseW: number; lengthScale: number };

type Request =
  | ({ type: "synth"; id: number; codepoints: number[]; rate: number } & Voice)
  | { type: "drop"; voice: string };

type Sherpa = {
  OfflineTts: new (config: unknown) => {
    sampleRate: number;
    generate: (req: unknown) => { samples: Float32Array; sampleRate: number };
  };
};

const port = (process as { parentPort?: Electron.ParentPort }).parentPort;

// Two threads measured best on the owner's 6-core laptop (ADR-0014).
const THREADS = 2;

// Lazy: loading the addon and onnxruntime costs time and memory only once speech is used.
let sherpa: Sherpa | null = null;
let loaded: { voice: string; tts: InstanceType<Sherpa["OfflineTts"]> } | null = null;

function engine(v: Voice): InstanceType<Sherpa["OfflineTts"]> {
  if (loaded?.voice === v.voice) return loaded.tts;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the native addon can't be bundled
  sherpa ??= require("sherpa-onnx-node") as Sherpa;
  const tts = new sherpa.OfflineTts({
    model: { vits: { model: v.modelPath, tokens: v.tokensPath, noiseScale: v.noiseScale, noiseScaleW: v.noiseW, lengthScale: v.lengthScale }, numThreads: THREADS, provider: "cpu", debug: 0 },
    maxNumSentences: 1,
  });
  loaded = { voice: v.voice, tts };
  return tts;
}

port?.on("message", (event: { data: Request }) => {
  const m = event.data;
  if (m.type === "drop") {
    if (loaded?.voice === m.voice) loaded = null;
    return;
  }
  try {
    const tts = engine(m);
    const t0 = performance.now();
    // silenceScale 1: sherpa's default (0.2) shortens Piper's pauses between words.
    // enableExternalBuffer false: Electron's V8 memory cage refuses external buffers.
    const audio = tts.generate({ text: "", enableExternalBuffer: false, generationConfig: { sid: 0, speed: m.rate, silenceScale: 1, phonemeCodepoints: [m.codepoints] } });
    const synthMs = performance.now() - t0;
    const samples = Float32Array.from(audio.samples);
    port.postMessage({ type: "pcm", id: m.id, samples, sampleRate: audio.sampleRate, synthMs });
  } catch (e) {
    port.postMessage({ type: "error", id: m.id, message: e instanceof Error ? e.message : String(e) });
  }
});
