import type { GroupBy } from "./reports";

// The entries filter in the URL (`?f=by:key`), so a breakdown row on the
// analytics page can open the entries page already filtered to it. The key is
// what the breakdown groups by: a category or account id, or a normalised
// payee. An empty key is the "No category" / "No payee" row.

export interface MoneyFilter {
  by: GroupBy;
  key: string;
}

const KINDS: readonly GroupBy[] = ["category", "account", "payee"];

export function filterParam(f: MoneyFilter): string {
  return `${f.by}:${f.key}`;
}

/** The filter a `?f=` value names, or null for one that names none. */
export function parseFilter(param: string | null): MoneyFilter | null {
  if (!param) return null;
  const at = param.indexOf(":");
  if (at < 0) return null;
  const by = param.slice(0, at);
  const key = param.slice(at + 1);
  const kind = KINDS.find((k) => k === by);
  if (!kind) return null;
  // Accounts have no "none" row.
  if (kind === "account" && key === "") return null;
  return { by: kind, key };
}
