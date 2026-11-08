import { openPath } from "./bridge";

/*
 * Links the system hands Wanheda: `wanheda://open/<page>?<query>`. Each
 * becomes a path in the app, which bridge.ts `openPath` checks against its
 * allowlist; anything else is dropped (SPEC V76).
 */

export const WANHEDA_SCHEME = "wanheda";

/** Longest link taken. */
export const MAX_LINK = 2048;

/** The app path a link opens, or null. */
export function linkPath(link: string): string | null {
  if (link.length > MAX_LINK) return null;
  const match = /^wanheda:\/\/open(\/[^?#]*)?(\?[^#]*)?$/i.exec(link);
  if (!match) return null;
  const raw = match[1] ?? "/";
  // Windows can add a slash to the end of a link it passes on.
  const page = raw.length > 1 ? raw.replace(/\/$/, "") : raw;
  return openPath(`${page}${match[2] ?? ""}`);
}

/**
 * The first link in a command line, if any. Windows passes links as
 * arguments, and Chromium may move its own switches around them.
 */
export function linkArg(argv: readonly string[]): string | undefined {
  return argv.find((arg) => /^wanheda:/i.test(arg));
}
