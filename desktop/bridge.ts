/*
 * The page ↔ main bridge (preload.ts exposes it as `window.wanheda`). Channel
 * names and every check on what crosses live here, pure and tested (SPEC
 * V67): main never trusts what the page sends, and only sends paths it knows
 * the app has.
 */

export const CHANNELS = {
  /** main → page: show this path in the app (a `wanheda://` link was opened). */
  open: "wanheda:open",
} as const;

export type SenderFrame = { origin: string; isTop: boolean };

/** Only the app's own top frame may use the bridge: not an embed, not another site. */
export function trustedSender(frame: SenderFrame | null | undefined, appOrigin: string | null): boolean {
  return Boolean(frame && appOrigin && frame.isTop && frame.origin === appOrigin);
}

/** The pages main may send the window to, and the query keys each takes. */
export const OPEN_PAGES: Readonly<Record<string, ReadonlySet<string>>> = {
  "/": new Set(),
  "/money": new Set(),
  "/money/analytics": new Set(),
  "/money/budgets": new Set(),
  "/money/import": new Set(),
  "/money/rules": new Set(),
  "/money/subscriptions": new Set(),
  "/income": new Set(),
  "/income/goals": new Set(),
  "/income/net": new Set(),
  "/notes": new Set(["n", "view"]),
  "/reader": new Set(),
  "/media": new Set(["tab", "m", "sort"]),
  "/settings": new Set(["s"]),
};

/** Longest query value taken. Ids and tab names are short. */
export const MAX_VALUE = 200;

const BASE = "http://wanheda.invalid";

/**
 * `path` as a same-app path main may send the page to, or null. Only the
 * pages and query keys above get through, each key once.
 */
export function openPath(path: string): string | null {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return null;
  let url: URL;
  try {
    url = new URL(path, BASE);
  } catch {
    return null;
  }
  // No "..", "%2e", tabs or other spellings the URL parser would tidy into an allowed page.
  if (url.origin !== BASE || url.hash || path.split("?")[0] !== url.pathname) return null;
  const allowed = OPEN_PAGES[url.pathname];
  if (!allowed) return null;
  const entries = [...url.searchParams.entries()];
  const keys = entries.map(([key]) => key);
  if (keys.some((key) => !allowed.has(key)) || new Set(keys).size !== keys.length) return null;
  if (entries.some(([, value]) => value.length > MAX_VALUE)) return null;
  return `${url.pathname}${url.search}`;
}
