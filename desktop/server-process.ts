import { utilityProcess } from "electron";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import type { Log } from "./log";
import { LISTEN_HOST, originFor, TOKEN_HEADER } from "./shared";

export type ServerHandle = {
  readonly port: number;
  readonly origin: string;
  /** Graceful stop; resolves once the server process is gone. */
  stop(): Promise<void>;
  /** Called if the server exits without being asked to. */
  onExit(listener: (detail: string) => void): void;
  /** GitHub's redirect reached the server in the system browser (desktop/oauth.ts); never in dev. */
  onOAuthCallback(listener: (search: string) => void): void;
};

/** A start failure with a message meant for the owner. */
export class ServerStartError extends Error {}

/* ── Packaged / preview: the standalone server in a utility process ──────── */

type Report = { type: "ready"; port: number } | { type: "failed"; message: string };
type Message = Report | { type: "oauth-callback"; search: unknown };

export async function startStandaloneServer(opts: { serverDir: string; port: number; env: Record<string, string>; log: Log }): Promise<ServerHandle> {
  const child = utilityProcess.fork(join(opts.serverDir, "wanheda-server.cjs"), [], {
    cwd: opts.serverDir,
    env: opts.env,
    stdio: "pipe",
    serviceName: "Wanheda Server",
  });
  const onData = (chunk: Buffer) => { opts.log.write(chunk.toString()); };
  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);
  const exited = new Promise<number>((resolve) => child.once("exit", resolve));

  const callbackListeners: ((search: string) => void)[] = [];
  const report = await new Promise<Report>((resolve) => {
    const timer = setTimeout(() => { resolve({ type: "failed", message: "timed out" }); }, 90_000);
    child.on("message", (message: Message) => {
      if (message.type === "oauth-callback") {
        if (typeof message.search === "string") for (const listener of callbackListeners) listener(message.search);
        return;
      }
      clearTimeout(timer);
      resolve(message);
    });
    void exited.then((code) => {
      clearTimeout(timer);
      resolve({ type: "failed", message: `exited with code ${code}` });
    });
  });
  if (report.type !== "ready") {
    child.kill();
    opts.log.info(`server failed: ${report.message}`);
    throw new ServerStartError("Wanheda's background server didn't start.");
  }

  let stopping = false;
  const listeners: ((detail: string) => void)[] = [];
  void exited.then((code) => {
    if (!stopping) for (const listener of listeners) listener(`server exited with code ${code}`);
  });

  return {
    port: report.port,
    origin: originFor(report.port),
    onExit: (listener) => void listeners.push(listener),
    onOAuthCallback: (listener) => void callbackListeners.push(listener),
    async stop() {
      if (stopping) return;
      stopping = true;
      // The server drains requests (at most 3 s) and closes Next before it exits.
      child.postMessage({ type: "shutdown" });
      const exitedInTime = await Promise.race([exited.then(() => true), delay(5000).then(() => false)]);
      if (!exitedInTime) child.kill();
    },
  };
}

const DEV_LOCKED = /Another next dev server is already running/i;

/* ── Dev: `next dev` from the repo, for HMR ──────────────────────────────── */

export async function startDevServer(opts: { repoRoot: string; port: number; token: string; env: Record<string, string>; log: Log }): Promise<ServerHandle> {
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
    await waitUntilServing(origin, opts.token, exited, 180_000);
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
    // `next dev` has no token gate, so the browser never comes back through it: dev signs in in the auth window.
    onOAuthCallback: () => undefined,
    async stop() {
      if (stopping) return;
      stopping = true;
      killTree(child);
      await Promise.race([exited, delay(5000)]);
    },
  };
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

/** Polls until the server answers anything at all, the process exits, or time runs out. */
async function waitUntilServing(origin: string, token: string, exited: Promise<unknown>, timeoutMs: number): Promise<void> {
  const state = { gone: false };
  void exited.then(() => (state.gone = true));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (state.gone) throw new ServerStartError("The Wanheda server stopped while starting. See server.log for details.");
    try {
      await fetch(`${origin}/login`, { headers: { [TOKEN_HEADER]: token }, redirect: "manual", signal: AbortSignal.timeout(60_000) });
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
