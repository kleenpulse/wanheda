// Synthesis units (SPEC V47, ADR-0012). A unit is one sentence or a piece of
// one, never two sentences, so a sentence's audio starts exactly where its
// first unit starts. Units are cut lazily, one at a time, from a cap that
// ramps after play or seek: a small first unit keeps the press → first audio
// short, and each later unit may only be as long as its synthesis can finish
// before the audio already queued runs out.

/** The smallest cap: the first unit after play or seek. */
export const UNIT_MIN = 60;
/** The largest cap: bounds one synthesis's time and the worker's wasm memory. */
export const UNIT_MAX = 200;
/** A unit's synthesis must end within this share of the audio queued ahead of it. */
const SAFETY = 0.8;

const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;
/** Punctuation that ends a clause when a space follows it. */
const CLAUSE_END = /[,;:)\]—–]/;

/**
 * Where the next unit cut from `text[from..]` ends (exclusive): the whole
 * rest when it fits in `cap`; else after the last clause end ("word, ")
 * in the second half of the window; else at its last space; else hard at the
 * cap, never inside a surrogate pair.
 */
export function cutUnit(text: string, from: number, cap: number): number {
  const limit = from + Math.max(1, Math.floor(cap));
  if (text.length <= limit) return text.length;
  for (let i = limit; i > from + cap / 2; i--) {
    if (text.charAt(i) === " " && CLAUSE_END.test(text.charAt(i - 1))) return i;
  }
  const space = text.lastIndexOf(" ", limit);
  if (space > from + cap / 3) return space;
  return isLowSurrogate(text.charCodeAt(limit)) ? limit - 1 : limit;
}

/** Where the text after a cut resumes: past the spaces at the cut. */
export function skipSpaces(text: string, at: number): number {
  let i = at;
  while (i < text.length && text.charAt(i) === " ") i++;
  return i;
}

/**
 * The ramp's next cap after a unit cut at `prev`: at most min(2, 0.8 ÷ RTF)
 * times bigger, so at the measured real-time factor the next unit's
 * synthesis ends before this one's audio does. Never below UNIT_MIN (at an
 * RTF of 0.8 or more the caps stay there and gaps become possible).
 */
export function nextCap(prev: number, rtf: number): number {
  const factor = Math.min(2, SAFETY / Math.max(rtf, 1e-3));
  return clampCap(prev * factor);
}

/**
 * The longest unit whose synthesis still ends before the queued audio runs
 * out: SAFETY × queued seconds of synthesis, at the measured RTF and seconds
 * of audio per character. Nothing queued ⇒ UNIT_MIN.
 */
export function budgetCap(queuedSeconds: number, rtf: number, secondsPerChar: number): number {
  if (queuedSeconds <= 0) return UNIT_MIN;
  return clampCap((SAFETY * queuedSeconds) / (Math.max(rtf, 1e-3) * Math.max(secondsPerChar, 1e-4)));
}

function clampCap(n: number): number {
  // The epsilon keeps a float like 79.99999 (60 × 0.8 ÷ 0.6) from flooring a whole character off.
  return Math.max(UNIT_MIN, Math.min(UNIT_MAX, Math.floor(n + 1e-6)));
}
