/*
 * How the desktop app updates (SPEC V75). New versions come from published
 * GitHub Releases on kleenpulse/wanheda: CI uploads a draft on a `v*` tag, and
 * a person publishes it (desktop/RELEASING.md). Drafts and prereleases are
 * invisible to the updater, so a pushed tag alone never reaches anyone.
 */

/**
 * - auto: download in the background, ask to restart, install on quit.
 * - off: dev and preview runs, and systems without an installer yet.
 */
export type UpdateMode = "auto" | "off";

export function updateMode({ packaged, platform }: { packaged: boolean; platform: NodeJS.Platform }): UpdateMode {
  // The NSIS installer updates itself. Unsigned for now: trust is HTTPS to GitHub plus the
  // sha512 in latest.yml (electron-updater checks a signature only once app-update.yml names a publisher).
  return packaged && platform === "win32" ? "auto" : "off";
}

/** The first check waits for a quiet moment after start. */
export const FIRST_CHECK_DELAY_MS = 30_000;
export const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/** Where the updater looks: exactly what electron-builder.yml's `publish` writes into app-update.yml. */
export const UPDATE_FEED = { provider: "github", owner: "kleenpulse", repo: "wanheda" } as const;

/**
 * Whether a packaged app-update.yml points at this repo's releases and nothing
 * else (scripts/build.ts checks it): a wrong feed would install someone else's code.
 */
export function isOwnFeed(text: string): boolean {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
  const entries = new Map<string, string>();
  for (const line of lines) {
    const match = /^([A-Za-z]+):\s*(.*)$/.exec(line);
    if (!match?.[1] || match[2] === undefined) return false;
    entries.set(match[1], match[2].replace(/^(['"])(.*)\1$/, "$2"));
  }
  if (entries.get("provider") !== UPDATE_FEED.provider || entries.get("owner") !== UPDATE_FEED.owner || entries.get("repo") !== UPDATE_FEED.repo) return false;
  // No other place to fetch from, and no publisher pinned yet (V75: unsigned until Azure Trusted Signing).
  const allowed = new Set(["provider", "owner", "repo", "updaterCacheDirName"]);
  return [...entries.keys()].every((key) => allowed.has(key));
}

/**
 * What's wrong with a build's latest.yml (the file the updater reads from the
 * release), or null: it must name this version and this installer, with the
 * installer's own sha512, or every copy of the app would refuse the update.
 */
export function latestYmlProblem(text: string, expected: { version: string; file: string; sha512: string }): string | null {
  const top = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Za-z0-9]+):\s*(.*)$/.exec(line);
    if (match?.[1] && match[2] !== undefined) top.set(match[1], match[2].replace(/^(['"])(.*)\1$/, "$2"));
  }
  if (top.get("version") !== expected.version) return `latest.yml names version ${top.get("version") ?? "none"}, not ${expected.version}`;
  if (top.get("path") !== expected.file) return `latest.yml points at ${top.get("path") ?? "nothing"}, not ${expected.file}`;
  if (top.get("sha512") !== expected.sha512) return "latest.yml's sha512 isn't the installer's";
  return null;
}
