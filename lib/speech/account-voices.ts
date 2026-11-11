import { CATALOG, voiceSize, type CatalogVoice } from "./voices";

// The voices the owner keeps across devices (SPEC V83). Pure, so the server
// (on the way in and out of `account_voices`) and the client check ids the
// same way. Only catalog ids survive; order is always the catalog's.

/** Catalog ids from anything, deduped, in catalog order; unknown ids and junk dropped. */
export function parseAccountVoices(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids = new Set(raw.filter((v): v is string => typeof v === "string"));
  return CATALOG.filter((v) => ids.has(v.id)).map((v) => v.id);
}

/** Every entry a catalog id, at most one each: what the server takes. Null otherwise. */
export function strictAccountVoices(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length > CATALOG.length) return null;
  const parsed = parseAccountVoices(raw);
  return parsed.length === raw.length ? parsed : null;
}

/** The list with `id` in or out, in catalog order. */
export function withVoice(list: readonly string[], id: string, keep: boolean): string[] {
  return parseAccountVoices(keep ? [...list, id] : list.filter((v) => v !== id));
}

export function sameVoices(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** The account's voices this device doesn't have and isn't fetching, in catalog order. */
export function missingVoices(account: readonly string[], here: readonly string[], fetching: readonly string[]): CatalogVoice[] {
  return CATALOG.filter((v) => account.includes(v.id) && !here.includes(v.id) && !fetching.includes(v.id));
}

export function bytesOf(voices: readonly CatalogVoice[]): number {
  return voices.reduce((n, v) => n + voiceSize(v), 0);
}

/** "Amy", "Amy and Lessac", "Amy, Lessac and Ryan": names, a quality where two share one. */
export function voiceNames(voices: readonly CatalogVoice[]): string {
  const names = voices.map((v) => (voices.filter((o) => o.name === v.name).length > 1 ? `${v.name} (${v.quality.replace("_", " ")})` : v.name));
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;
}

/** Names a set of voices for "Not now": the offer stays away until the set changes. */
export function offerKey(voices: readonly CatalogVoice[]): string {
  return voices.map((v) => v.id).join(",");
}
