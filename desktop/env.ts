/*
 * The environment the local server runs with (SPEC V68): a short allowlist
 * from the shell's own environment (Windows needs SystemRoot and TEMP for
 * sockets and DNS), the sealed `.env` values (V69), and what the shell sets
 * per launch. Nothing else leaks in: no NODE_OPTIONS, no DATABASE_URL from a
 * developer's shell.
 */

import { IMPORTED_NAMES, type Imported } from "./env-file";
import { originFor } from "./shared";

export type ServerMode = "dev" | "prod";

export type ServerEnvOptions = {
  mode: ServerMode;
  port: number;
  token: string;
  secrets: Imported;
};

const PASS = new Set([
  "systemroot",
  "windir",
  "path",
  "pathext",
  "comspec",
  "temp",
  "tmp",
  "tmpdir",
  "home",
  "userprofile",
  "appdata",
  "localappdata",
  "programdata",
  "lang",
  "language",
  "tz",
  "http_proxy",
  "https_proxy",
  "no_proxy",
]);

export function baseEnv(parent: Record<string, string | undefined>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(parent)) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    if (PASS.has(lower) || lower.startsWith("lc_")) env[key] = value;
  }
  return env;
}

export function serverEnv(parent: Record<string, string | undefined>, opts: ServerEnvOptions): Record<string, string> {
  const env = baseEnv(parent);
  env.NEXT_TELEMETRY_DISABLED = "1";
  env.WANHEDA_DESKTOP_TOKEN = opts.token;
  env.PORT = String(opts.port);
  // Every known name is set, empty when not imported: `next dev` fills unset
  // names from .env files, and a set-but-empty one wins (empty = not configured).
  for (const name of IMPORTED_NAMES) env[name] = opts.secrets[name] ?? "";
  // Sign-in and passkeys belong to this origin, never the web deploy's (ADR-0014).
  const origin = originFor(opts.port);
  env.BETTER_AUTH_URL = origin;
  env.NEXT_PUBLIC_APP_URL = origin;
  if (opts.mode === "prod") env.NODE_ENV = "production";
  return env;
}
