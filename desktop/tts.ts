import { utilityProcess, type UtilityProcess } from "electron";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { VOICE_FILES } from "./tts-catalog";
import { isVoiceId, metadataTail, parseTtsConfig, tokensText, type SynthRequest, type TtsConfig } from "./tts-model";

/*
 * Native Piper, main's side (SPEC V73). Voices live in userData/voices/<id>/:
 * the catalog model with sherpa's metadata appended, tokens.txt and the parsed
 * config. The page hands over a voice it already has (its OPFS copy, checked
 * when it was downloaded); main checks size and sha256 against the catalog
 * again before keeping anything, so nothing is downloaded twice on a metered
 * link. Synthesis runs in one utility process, started on first use and
 * released after a while idle; a crash or exit fails what's pending, and the
 * page falls back to WASM Piper (V73).
 */

const IDLE_MS = 3 * 60_000;
const SYNTH_TIMEOUT_MS = 60_000;

export type SynthOut = { samples: Float32Array; sampleRate: number; synthMs: number };

type Log = { info: (line: string) => void };

type Pending = { resolve: (r: SynthOut) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

/** The config kept next to a derived model: the parsed fields, and which catalog model it was made from. */
type KeptConfig = TtsConfig & { sourceSha256: string };

const CHUNK = 8 * 1024 * 1024;

/** sha256 in 8 MB steps with a turn of the event loop between them: a 114 MB voice never freezes the windows. */
async function sha256(bytes: Uint8Array): Promise<string> {
  const hash = createHash("sha256");
  for (let at = 0; at < bytes.byteLength; at += CHUNK) {
    hash.update(bytes.subarray(at, at + CHUNK));
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  return hash.digest("hex");
}

export function createSpeech(opts: { userData: string; speechDir: string; log: Log }) {
  const voicesDir = join(opts.userData, "voices");
  let proc: UtilityProcess | null = null;
  let nextId = 1;
  const pending = new Map<number, Pending>();
  let idle: ReturnType<typeof setTimeout> | null = null;
  // For the speed log (T82): what this process produced, and how fast.
  let stats = { units: 0, audioS: 0, synthMs: 0 };

  const files = (voice: string) => {
    const dir = join(voicesDir, voice);
    return { dir, model: join(dir, "model.onnx"), tokens: join(dir, "tokens.txt"), config: join(dir, "config.json") };
  };

  /**
   * The kept config, only while it was made from the catalog's current model:
   * a voice the catalog has since re-pinned (V46) counts as not kept, so the
   * page hands the new one over.
   */
  function readConfig(voice: string): KeptConfig | null {
    try {
      const kept = JSON.parse(readFileSync(files(voice).config, "utf8")) as KeptConfig;
      return isVoiceId(voice) && kept.sourceSha256 === VOICE_FILES[voice]?.model.sha256 ? kept : null;
    } catch {
      return null;
    }
  }

  function has(voice: string): boolean {
    const f = files(voice);
    return isVoiceId(voice) && existsSync(f.model) && existsSync(f.tokens) && readConfig(voice) !== null;
  }

  /** Keeps a voice the page handed over, if both files match the catalog. False otherwise (nothing is written). */
  async function install(voice: string, model: Uint8Array, configText: string): Promise<boolean> {
    const want = isVoiceId(voice) ? VOICE_FILES[voice] : undefined;
    if (!want) return false;
    const configBytes = new TextEncoder().encode(configText);
    if (model.byteLength !== want.model.size || (await sha256(model)) !== want.model.sha256) return false;
    if (configBytes.byteLength !== want.config.size || (await sha256(configBytes)) !== want.config.sha256) return false;
    const config = parseTtsConfig(configText);
    if (!config) return false;
    const f = files(voice);
    await mkdir(f.dir, { recursive: true });
    const write = async (path: string, data: string | Uint8Array) => {
      await writeFile(`${path}.part`, data);
      await rename(`${path}.part`, path);
    };
    await write(f.model, Buffer.concat([model, metadataTail(config)]));
    await write(f.tokens, tokensText(config));
    // Last: `has` only counts a voice once its config is there, made from this catalog model.
    const kept: KeptConfig = { ...config, sourceSha256: want.model.sha256 };
    await write(f.config, JSON.stringify(kept));
    opts.log.info(`speech: kept voice ${voice}`);
    return true;
  }

  function drop(voice: string): void {
    if (!isVoiceId(voice)) return;
    proc?.postMessage({ type: "drop", voice });
    rmSync(files(voice).dir, { recursive: true, force: true });
  }

  function failAll(message: string): void {
    for (const [id, p] of pending) {
      clearTimeout(p.timer);
      p.reject(new Error(message));
      pending.delete(id);
    }
  }

  function logStats(): void {
    if (stats.units === 0) return;
    const rtf = stats.audioS > 0 ? stats.synthMs / 1000 / stats.audioS : 0;
    opts.log.info(`speech: ${String(stats.units)} units, ${stats.audioS.toFixed(1)} s audio in ${(stats.synthMs / 1000).toFixed(1)} s, RTF ${rtf.toFixed(3)}`);
    stats = { units: 0, audioS: 0, synthMs: 0 };
  }

  function stop(): void {
    if (idle) clearTimeout(idle);
    idle = null;
    logStats();
    const p = proc;
    proc = null;
    p?.kill();
    failAll("Speech stopped.");
  }

  function ensure(): UtilityProcess {
    if (proc) return proc;
    const child = utilityProcess.fork(join(opts.speechDir, "wanheda-speech.cjs"), [], {
      serviceName: "Wanheda speech",
      // Nothing it doesn't need: no secrets, no proxy settings (it never touches the network).
      env: { SystemRoot: process.env.SystemRoot ?? "C:\\Windows" },
      stdio: "ignore",
    });
    child.on("message", (m: { type: string; id: number; samples?: Float32Array; sampleRate?: number; synthMs?: number; message?: string }) => {
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      clearTimeout(p.timer);
      if (m.type === "pcm" && m.samples && m.sampleRate) {
        stats.units += 1;
        stats.audioS += m.samples.length / m.sampleRate;
        stats.synthMs += m.synthMs ?? 0;
        p.resolve({ samples: m.samples, sampleRate: m.sampleRate, synthMs: m.synthMs ?? 0 });
      } else p.reject(new Error(m.message ?? "Speech failed."));
    });
    child.on("exit", (code) => {
      if (proc !== child) return;
      proc = null;
      opts.log.info(`speech process exited (${String(code)})`);
      logStats();
      failAll("The speech process stopped.");
    });
    proc = child;
    return child;
  }

  /** Audio for phonemes in a kept voice. Rejects when the voice isn't kept, the process fails, or it takes too long. */
  function synth(req: SynthRequest): Promise<SynthOut> {
    const config = readConfig(req.voice);
    if (!config || !has(req.voice)) return Promise.reject(new Error("That voice isn't on this computer yet."));
    const child = ensure();
    if (idle) clearTimeout(idle);
    idle = setTimeout(stop, IDLE_MS);
    const id = nextId++;
    const f = files(req.voice);
    return new Promise<SynthOut>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("Speech took too long."));
      }, SYNTH_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer });
      child.postMessage({
        type: "synth",
        id,
        voice: req.voice,
        modelPath: f.model,
        tokensPath: f.tokens,
        noiseScale: config.noiseScale,
        noiseW: config.noiseW,
        lengthScale: config.lengthScale,
        codepoints: req.codepoints,
        rate: req.rate,
      });
    });
  }

  return { has, install, drop, synth, stop };
}
