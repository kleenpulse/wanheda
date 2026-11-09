/*
 * The `.env` import (SPEC V69). The owner picks a file once; only the names
 * `.env.example` lists are taken (a test keeps the two lists equal), and the
 * file itself is never kept or copied. Values never reach a log.
 */

/** Every name in `.env.example`, in its order. */
export const KNOWN_ENV_NAMES = [
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "ADMIN_EMAILS",
  "WEATHER_LATITUDE",
  "WEATHER_LONGITUDE",
  "WEATHER_PLACE",
  "CONNECTOR_SEAL_KEY",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "NEXT_PUBLIC_APP_URL",
] as const;

export type EnvName = (typeof KNOWN_ENV_NAMES)[number];

/**
 * Names the desktop app sets itself, per launch, from the local origin: an
 * imported value (the web deploy's URL) would point sign-in at the wrong site.
 */
export const SHELL_OWNED: ReadonlySet<EnvName> = new Set(["BETTER_AUTH_URL", "NEXT_PUBLIC_APP_URL"]);

/** Names the import takes from a file. */
export const IMPORTED_NAMES: readonly EnvName[] = KNOWN_ENV_NAMES.filter((name) => !SHELL_OWNED.has(name));

export type Imported = Partial<Record<EnvName, string>>;

/** Largest `.env` file read. A real one is a few kilobytes. */
export const MAX_ENV_FILE = 64 * 1024;

/**
 * The known, non-empty values in a `.env` file's text. Lines are `NAME=value`
 * or `export NAME=value`; values may be single- or double-quoted, and an
 * unquoted value ends at ` #`. The last line for a name wins, as in dotenv.
 */
export function parseEnvFile(text: string): { values: Imported; taken: number; ignored: number } {
  const wanted = new Set<string>(IMPORTED_NAMES);
  const values = new Map<EnvName, string>();
  let ignored = 0;
  for (const rawLine of withoutBom(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const name = match[1] ?? "";
    if (!wanted.has(name)) {
      ignored += 1;
      continue;
    }
    const value = unquote(match[2] ?? "");
    if (value === "") values.delete(name as EnvName);
    else values.set(name as EnvName, value);
  }
  return { values: Object.fromEntries(values), taken: values.size, ignored };
}

/** Drops a leading byte-order mark (Notepad adds one). */
function withoutBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function unquote(raw: string): string {
  const quote = raw[0];
  if (quote === '"' || quote === "'") {
    const end = raw.indexOf(quote, 1);
    const inner = end === -1 ? raw.slice(1) : raw.slice(1, end);
    return quote === '"' ? inner.replace(/\\n/g, "\n") : inner;
  }
  const comment = raw.search(/\s#/);
  return (comment === -1 ? raw : raw.slice(0, comment)).trim();
}

/** Only known names with string values: what a sealed record may hold. */
export function knownValues(raw: unknown): Imported | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const wanted = new Set<string>(IMPORTED_NAMES);
  const out: Imported = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!wanted.has(name)) continue;
    if (typeof value !== "string") return null;
    if (value !== "") out[name as EnvName] = value;
  }
  return out;
}
