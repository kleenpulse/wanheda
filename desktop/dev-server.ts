import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import type { Log } from "./log";
import { LISTEN_HOST, originFor } from "./shared";

/*
 * `desktop:dev` only: `next dev` from the repo, for HMR (ADR-0016). Preview and
 * packaged builds load the hosted app and run no server of their own.
 */

export type ServerHandle = {
  readonly port: number;
  readonly origin: string;
  /** Resolves once the server process is gone. */
  stop(): Promise<void>;
  /** Called if the server exits without being asked to. */
  onExit(listener: (detail: string) => void): void;
};

/** A start failure with a message meant for the owner. */
export class ServerStartError extends Error {}

/** What a Windows process needs from the shell's environment (sockets, DNS, temp files, locale). */
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

/**
 * `next dev`'s environment: a short allowlist from the shell's own, so nothing
 * else leaks in (no NODE_OPTIONS, no DATABASE_URL from the terminal). Next
 * fills the app's settings from the repo's `.env` files, as `bun run dev`
 * does. Sign-in and passkeys belong to this origin, never the web deploy's.
 */
export function devEnv(parent: Record<string, string | undefined>, port: number): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(parent)) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    if (PASS.has(lower) || lower.startsWith("lc_")) env[key] = value;
  }
  const origin = originFor(port);
  env.NEXT_TELEMETRY_DISABLED = "1";
  env.PORT = String(port);
  env.BETTER_AUTH_URL = origin;
  env.NEXT_PUBLIC_APP_URL = origin;
  return env;
}

const DEV_LOCKED = /Another next dev server is already running/i;

export async function startDevServer(opts: { repoRoot: string; port: number; env: Record<string, string>; log: Log }): Promise<ServerHandle> {
  const next = join(opts.repoRoot, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.env.WANHEDA_NODE || "node", [next, "dev", "--hostname", LISTEN_HOST, "--port", String(opts.port)], {
    cwd: opts.repoRoot,
    env: opts.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    // Own process group on POSIX so the whole tree can be stopped.
    detached: process.platform !== "win32",
  });
  const output = capture(child, opts.log);
  const exited = new Promise<number | null>((resolve) => child.once("exit", (code) => { resolve(code); }));
  const origin = originFor(opts.port);

  try {
    await waitUntilServing(origin, exited, 180_000);
  } catch (err) {
    killTree(child);
    if (DEV_LOCKED.test(output())) {
      throw new ServerStartError(
        "Another `next dev` is already running in this project. Next.js allows only one at a time, so stop your own dev server first, then run desktop:dev again.",
      );
    }
    throw err;
  }

  let stopping = false;
  const listeners: ((detail: string) => void)[] = [];
  void exited.then((code) => {
    if (!stopping) for (const listener of listeners) listener(`next dev exited with code ${code}`);
  });

  return {
    port: opts.port,
    origin,
    onExit: (listener) => void listeners.push(listener),
    async stop() {
      if (stopping) return;
      stopping = true;
      killTree(child);
      await Promise.race([exited, delay(5000)]);
    },
  };
}

/** Polls until the server answers anything at all, the process exits, or time runs out. */
async function waitUntilServing(origin: string, exited: Promise<unknown>, timeoutMs: number): Promise<void> {
  const state = { gone: false };
  void exited.then(() => (state.gone = true));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (state.gone) throw new ServerStartError("The Wanheda server stopped while starting. See server.log for details.");
    try {
      await fetch(`${origin}/login`, { redirect: "manual", signal: AbortSignal.timeout(60_000) });
      return;
    } catch {
      await delay(500);
    }
  }
  throw new ServerStartError("The Wanheda server took too long to start. See server.log for details.");
}

function capture(child: ChildProcess, log: Log): () => string {
  let tail = "";
  const onData = (chunk: Buffer) => {
    const text = chunk.toString();
    log.write(text);
    tail = (tail + text).slice(-8192);
  };
  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);
  return () => tail;
}

function killTree(child: ChildProcess): void {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === "win32") {
    // By full path: Windows looks for a bare name in the current folder before PATH.
    spawnSync(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe"), ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
