/// <reference lib="webworker" />
import { phonemize } from "phonemizer";
import { parseVoiceConfig, phonemeCodepoints, textToPhonemes, type PiperVoiceConfig } from "./piper-ids";
import { readVoiceFiles } from "./voices";

// Phonemes for the desktop's native Piper (SPEC V73): the same piper-ids.ts and
// phonemizer (espeak-ng) as the web engine, without onnxruntime, so the native
// path never loads the WASM model. Answers with Unicode code points (NFD),
// which sherpa-onnx takes in place of text.

declare const self: DedicatedWorkerGlobalScope;

type Request = { id: number; voice: string; text: string };
type Response = { id: number; ok: true; codepoints: number[] } | { id: number; ok: false; error: string };

const configs = new Map<string, PiperVoiceConfig>();
let chain: Promise<void> = Promise.resolve();

async function config(voice: string): Promise<PiperVoiceConfig> {
  const known = configs.get(voice);
  if (known) return known;
  const files = await readVoiceFiles(voice);
  if (!files) throw new Error(`voice ${voice} is not on this device`);
  const parsed = parseVoiceConfig(JSON.parse(await files.config.text()));
  if (!parsed) throw new Error(`voice ${voice} has a config Piper can't run`);
  configs.set(voice, parsed);
  return parsed;
}

self.onmessage = (event: MessageEvent<Request>) => {
  const req = event.data;
  // One at a time, in order: espeak-ng's runtime isn't reentrant.
  chain = chain.then(async () => {
    try {
      const c = await config(req.voice);
      const phonemes = await textToPhonemes(req.text, (t) => phonemize(t, c.espeak.voice));
      self.postMessage({ id: req.id, ok: true, codepoints: phonemeCodepoints(phonemes) } satisfies Response);
    } catch (e) {
      self.postMessage({ id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) } satisfies Response);
    }
  });
};
