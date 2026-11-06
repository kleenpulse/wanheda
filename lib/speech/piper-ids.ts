// Text → Piper input ids (SPEC V45, ADR-0012), the part of the Piper engine
// that needs no wasm. espeak-ng (the `phonemizer` package) turns words into
// IPA. Piper also needs the clause punctuation in its phoneme stream, where
// espeak would swallow it, so text is phonemized between punctuation runs and
// the marks Piper knows are put back. Then each phoneme maps to its ids from
// the voice's `phoneme_id_map`, Piper style (piper-phonemize
// phoneme_ids.cpp): BOS `^`, a pad `_` after it and after every phoneme,
// EOS `$`.

/** One run of punctuation (with the spaces around it). */
const PUNCT_RUN = /(?:\s*[;:,.!?¡¿—…"«»“”()]+\s*)+/g;
/** The marks Piper voices have ids for, as espeak writes them at a clause end. */
const KEPT = ",.?!:;";

export type Phonemize = (text: string) => Promise<string[]>;

/** A punctuation run as Piper expects it: its first kept mark and a space (espeak ends a clause with one), or just a space. */
export function punctuationPhonemes(run: string): string {
  const mark = Array.from(run).find((c) => KEPT.includes(c));
  return mark ? `${mark} ` : " ";
}

/** The IPA phoneme string for a piece of text, punctuation included. */
export async function textToPhonemes(text: string, phonemize: Phonemize): Promise<string> {
  const parts: string[] = [];
  let last = 0;
  for (const m of text.matchAll(PUNCT_RUN)) {
    const words = text.slice(last, m.index);
    if (words.trim()) parts.push((await phonemize(words)).join(" "));
    parts.push(punctuationPhonemes(m[0]));
    last = m.index + m[0].length;
  }
  const tail = text.slice(last);
  if (tail.trim()) parts.push((await phonemize(tail)).join(" "));
  return parts.join("").trim();
}

export type PhonemeIdMap = Readonly<Record<string, readonly number[]>>;

/** Piper ids for a phoneme string. Phonemes the voice has no id for are dropped (and counted in `missing`). */
export function phonemeIds(phonemes: string, map: PhonemeIdMap, missing?: Map<string, number>): number[] {
  const bos = map["^"];
  const eos = map["$"];
  const pad = map["_"];
  if (!bos || !eos || !pad) throw new Error("voice phoneme_id_map lacks ^, $ or _");
  const ids: number[] = [...bos, ...pad];
  // piper-phonemize splits phonemes into code points after NFD normalization.
  for (const ch of Array.from(phonemes.normalize("NFD"))) {
    const id = map[ch];
    if (!id) {
      missing?.set(ch, (missing.get(ch) ?? 0) + 1);
      continue;
    }
    ids.push(...id, ...pad);
  }
  ids.push(...eos);
  return ids;
}

/** The parts of a Piper voice's `.onnx.json` the engine reads. */
export interface PiperVoiceConfig {
  audio: { sample_rate: number };
  inference: { noise_scale: number; length_scale: number; noise_w: number };
  num_speakers: number;
  phoneme_id_map: PhonemeIdMap;
  /** The espeak-ng voice the model was trained with (`en-us`, `en`, `en-gb-x-rp`): its phonemes must come from the same one. */
  espeak: { voice: string };
}

/** The espeak-ng voices the bundled phonemizer has (English only, ADR-0012). */
export const ESPEAK_VOICES: ReadonlySet<string> = new Set(["en", "en-029", "en-gb", "en-gb-scotland", "en-gb-x-gbclan", "en-gb-x-gbcwmd", "en-gb-x-rp", "en-us", "en-us-nyc"]);

/** A voice config read back, or null when it isn't one Piper can run. */
export function parseVoiceConfig(raw: unknown): PiperVoiceConfig | null {
  if (typeof raw !== "object" || raw === null) return null;
  const c = raw as Partial<Omit<PiperVoiceConfig, "espeak">> & { espeak?: { voice?: unknown }; phoneme_type?: unknown };
  const rate = c.audio?.sample_rate;
  const inf = c.inference;
  const map = c.phoneme_id_map;
  if (typeof rate !== "number" || !(rate > 0) || !inf || typeof map !== "object") return null;
  if (![inf.noise_scale, inf.length_scale, inf.noise_w].every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  for (const k of ["^", "$", "_"]) if (!Array.isArray(map[k])) return null;
  // Older configs have no phoneme_type: espeak was the only kind then.
  if (c.phoneme_type !== undefined && c.phoneme_type !== "espeak") return null;
  const espeak = c.espeak?.voice ?? "en-us";
  if (typeof espeak !== "string" || !ESPEAK_VOICES.has(espeak)) return null;
  return {
    audio: { sample_rate: rate },
    inference: inf,
    num_speakers: typeof c.num_speakers === "number" ? c.num_speakers : 1,
    phoneme_id_map: map,
    espeak: { voice: espeak },
  };
}
