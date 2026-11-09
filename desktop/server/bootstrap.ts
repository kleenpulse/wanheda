import { readFileSync } from "node:fs";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { createRequire } from "node:module";
import { join } from "node:path";
import { browserReturn, RETURNED_HEADERS, RETURNED_HTML, RETURNED_PATH, type Provider } from "../oauth";
import { LISTEN_HOST, ORIGIN_HOST, originFor, TOKEN_HEADER } from "../shared";
import { checkRequest } from "./guard";

/*
 * The desktop app's server process (bundled to <server>/wanheda-server.cjs, run
 * by Electron's utilityProcess). It does what Next's standalone server.js does
 * (node_modules/next/dist/server/lib/start-server.js), with three changes
 * (SPEC V68): it only listens on 127.0.0.1, every request must pass the Host +
 * token guard, and it never writes into its own folder (no ISR flush, no gzip;
 * the install folder may be read-only). The one tokenless request it takes is
 * the system browser coming back from GitHub (desktop/oauth.ts): its query goes
 * to the shell, never to Next.
 *
 * It reports {ready, port} or {failed} to the shell, and on {shutdown} it
 * drains (at most 3 s), closes Next, then exits.
 */

type Report = { type: "ready"; port: number } | { type: "failed"; message: string } | { type: "oauth-callback"; provider: Provider; search: string };
type Handlers = {
  requestHandler(req: IncomingMessage, res: ServerResponse): Promise<void>;
  server?: { close(): Promise<void> };
};
type StartServerModule = {
  getRequestHandlers: (opts: { dir: string; port: number; isDev: boolean; server: http.Server; hostname: string; quiet: boolean }) => Promise<Handlers>;
};

// The shell (and the smoke script) start this with cwd = the server folder.
// Not __dirname: the bundler bakes in the source folder.
const dir = process.cwd();
const token = process.env.WANHEDA_DESKTOP_TOKEN ?? "";
const inFlight = new Set<ServerResponse>();
// Undefined under plain Node (the smoke script); Electron's types say otherwise.
const parentPort = (process as { parentPort?: Electron.ParentPort }).parentPort;
let port = 0;
let handlers: Handlers | null = null;
let shuttingDown = false;

function report(message: Report): void {
  if (parentPort) parentPort.postMessage(message);
  // Without Electron (the smoke script), one JSON line on stdout.
  else console.log(JSON.stringify({ wanheda: message }));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The config Next inlined into server.js, which is what server.js itself would use. */
function standaloneConfig(): Record<string, unknown> & { experimental?: Record<string, unknown> } {
  const source = readFileSync(join(dir, "server.js"), "utf8");
  const match = /^const nextConfig = (\{.*\})\r?$/m.exec(source);
  if (!match?.[1]) throw new Error("server.js has no inlined nextConfig; this Next version needs a bootstrap update.");
  return JSON.parse(match[1]) as Record<string, unknown> & { experimental?: Record<string, unknown> };
}

async function listen(server: http.Server, wanted: number): Promise<number> {
  // A quick relaunch can find the old server still draining; wait briefly
  // before giving up the saved port (the origin, and everything kept per origin).
  let attempt = wanted;
  const giveUpAt = Date.now() + 2000;
  for (;;) {
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(attempt, LISTEN_HOST, () => {
          server.off("error", reject);
          resolve();
        });
      });
      return (server.address() as AddressInfo).port;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EADDRINUSE" || attempt === 0) throw err;
      if (Date.now() > giveUpAt) attempt = 0;
      else await delay(200);
    }
  }
}

/** One request the way the window sends it, to warm up rendering. Any status will do. */
function warmUp(): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: LISTEN_HOST, port, path: "/login", headers: { host: `${ORIGIN_HOST}:${port}`, [TOKEN_HEADER]: token }, timeout: 30_000 },
      (res) => {
        res.resume();
        res.on("end", () => { resolve(res.statusCode ?? 0); });
      },
    );
    req.on("timeout", () => req.destroy(new Error("the first page took over 30 s")));
    req.on("error", reject);
    req.end();
  });
}

async function start(): Promise<void> {
  if (!token) throw new Error("WANHEDA_DESKTOP_TOKEN is missing.");
  process.env.NODE_ENV = "production";
  // Never read a .env that slipped into the folder.
  process.env.__NEXT_PROCESSED_ENV = "true";
  process.env.NEXT_MANUAL_SIG_HANDLE = "true";
  process.chdir(dir);

  const config = standaloneConfig();
  config.compress = false;
  config.experimental = { ...config.experimental, isrFlushToDisk: false };
  process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(config);

  const nextRequire = createRequire(join(dir, "server.js"));
  nextRequire("next");
  const { getRequestHandlers } = nextRequire("next/dist/server/lib/start-server") as StartServerModule;

  const server = http.createServer((req, res) => {
    const back = browserReturn(req.method, req.url, req.headers.host, port, req.headers[TOKEN_HEADER] !== undefined);
    if (back) {
      // The shell decides whether it answers the sign-in it started; the tab learns nothing either way.
      if (back.kind === "callback") {
        report({ type: "oauth-callback", provider: back.provider, search: back.search });
        res.writeHead(303, { location: RETURNED_PATH, "cache-control": "no-store", "referrer-policy": "no-referrer" });
        res.end();
      } else {
        res.writeHead(200, RETURNED_HEADERS);
        res.end(RETURNED_HTML);
      }
      return;
    }
    const verdict = checkRequest(req.headers, port, token);
    if (!verdict.ok || !handlers) {
      res.statusCode = verdict.ok ? 503 : 403;
      res.end();
      return;
    }
    // The token stays on the request: Next re-sends these headers when a
    // server action redirects, and that internal request must pass too.
    inFlight.add(res);
    res.on("close", () => inFlight.delete(res));
    handlers.requestHandler(req, res).catch((err: unknown) => {
      console.error(err);
      if (!res.headersSent) res.statusCode = 500;
      res.end();
    });
  });
  server.on("upgrade", (_req, socket) => socket.destroy());

  port = await listen(server, Number(process.env.PORT) || 0);
  process.env.PORT = String(port);
  process.env.__NEXT_PRIVATE_ORIGIN = originFor(port);
  handlers = await getRequestHandlers({ dir, port, isDev: false, server, hostname: LISTEN_HOST, quiet: true });

  try {
    console.log(`warm-up: /login answered ${await warmUp()}`);
  } catch (err) {
    // A slow or failing first page shouldn't keep the window from opening.
    console.error(`warm-up: ${err instanceof Error ? err.message : String(err)}`);
  }
  report({ type: "ready", port });

  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.close();
    const until = Date.now() + 3000;
    while (inFlight.size > 0 && Date.now() < until) await delay(50);
    await handlers?.server?.close().catch((err: unknown) => { console.error(err); });
    process.exit(0);
  };
  parentPort?.on("message", (event) => {
    if ((event.data as { type?: string } | undefined)?.type === "shutdown") void shutdown();
  });
  process.once("SIGTERM", () => void shutdown());
  process.once("SIGINT", () => void shutdown());
}

start().catch((err: unknown) => {
  console.error(err);
  report({ type: "failed", message: err instanceof Error ? err.message : String(err) });
  setTimeout(() => process.exit(1), 100);
});
