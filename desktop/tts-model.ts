import { VOICE_FILES } from "./tts-catalog";

/*
 * Native Piper (SPEC V73, ADR-0014), pure. sherpa-onnx 2 needs two things a
 * stock Piper voice doesn't carry:
 *
 * - Seven metadata entries in the model. They're appended as ONNX
 *   `metadata_props` (ModelProto field 14, each a StringStringEntryProto
 *   {1: key, 2: value}); a protobuf parser merges fields appended at the end
 *   of a message, so no ONNX library is needed. Deterministic: lessac medium
 *   `5efe09…` becomes `ea793a…`.
 * - A `tokens.txt`: "<symbol> <id>" per line, from the config's phoneme_id_map.
 *
 * Phonemes come from the page (the same piper-ids.ts and phonemizer as the
 * web), as code points: sherpa no longer phonemizes.
 */

export type TtsConfig = {
  sampleRate: number;
  noiseScale: number;
  lengthScale: number;
  noiseW: number;
  speakers: number;
  espeakVoice: string;
  language: string;
  phonemeIdMap: Record<string, number[]>;
};

/** The config fields native Piper uses, or null when it isn't a voice it can run. */
export function parseTtsConfig(text: string): TtsConfig | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
  const c = obj(raw);
  if (!c) return null;
  const rate = obj(c.audio)?.sample_rate;
  const inf = obj(c.inference);
  const map = obj(c.phoneme_id_map);
  const voice = obj(c.espeak)?.voice ?? "en-us";
  if (typeof rate !== "number" || !(rate > 0) || !inf || !map) return null;
  const { noise_scale: noiseScale, length_scale: lengthScale, noise_w: noiseW } = inf;
  if (typeof noiseScale !== "number" || typeof lengthScale !== "number" || typeof noiseW !== "number") return null;
  if (![noiseScale, lengthScale, noiseW].every(Number.isFinite)) return null;
  if (typeof voice !== "string" || !/^[a-z-]{2,20}$/.test(voice)) return null;
  const phonemeIdMap: Record<string, number[]> = {};
  for (const [symbol, ids] of Object.entries(map)) {
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((n) => Number.isInteger(n) && n >= 0)) return null;
    phonemeIdMap[symbol] = ids as number[];
  }
  const language = obj(c.language)?.name_english;
  return {
    sampleRate: rate,
    noiseScale,
    lengthScale,
    noiseW,
    speakers: typeof c.num_speakers === "number" ? c.num_speakers : 1,
    espeakVoice: voice,
    language: typeof language === "string" ? language : "English",
    phonemeIdMap,
  };
}

function varint(n: number): number[] {
  const out: number[] = [];
  let v = n;
  while (v > 0x7f) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
  return out;
}

const utf8 = (s: string) => new TextEncoder().encode(s);

function field(no: number, bytes: Uint8Array): number[] {
  return [...varint((no << 3) | 2), ...varint(bytes.length), ...bytes];
}

/** The bytes appended to a stock Piper model so sherpa reads it. */
export function metadataTail(config: TtsConfig): Uint8Array {
  const meta: [string, string][] = [
    ["model_type", "vits"],
    ["comment", "piper"],
    ["language", config.language],
    ["voice", config.espeakVoice],
    ["has_espeak", "1"],
    ["n_speakers", String(config.speakers)],
    ["sample_rate", String(config.sampleRate)],
  ];
  return Uint8Array.from(meta.flatMap(([k, v]) => field(14, Uint8Array.from([...field(1, utf8(k)), ...field(2, utf8(v))]))));
}

/** sherpa's tokens.txt: each symbol and its first id, one per line. */
export function tokensText(config: TtsConfig): string {
  return `${Object.entries(config.phonemeIdMap)
    .map(([symbol, ids]) => `${symbol} ${String(ids[0])}`)
    .join("\n")}\n`;
}

export function isVoiceId(value: unknown): value is string {
  return typeof value === "string" && Object.hasOwn(VOICE_FILES, value);
}

/** Longest phoneme run taken in one synth: a sentence unit is far shorter. */
export const MAX_CODEPOINTS = 4000;

export type SynthRequest = { voice: string; codepoints: number[]; rate: number };

/** A synth request if the whole payload is well formed, else null. */
export function parseSynthRequest(payload: unknown): SynthRequest | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const { voice, codepoints, rate } = payload as Record<string, unknown>;
  if (!isVoiceId(voice) || typeof rate !== "number" || !(rate >= 0.5 && rate <= 2)) return null;
  if (!Array.isArray(codepoints) || codepoints.length === 0 || codepoints.length > MAX_CODEPOINTS) return null;
  if (!codepoints.every((c) => Number.isInteger(c) && c > 0 && c <= 0x10ffff)) return null;
  return { voice, codepoints: codepoints as number[], rate };
}
