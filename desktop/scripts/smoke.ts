/*
 * bun desktop/scripts/smoke.ts [server-dir]
 *
 * Boots the staged server under plain Node in demo mode and checks the guard
 * from outside (SPEC V68): the app's request gets 200; no token, a foreign
 * Host, or the other loopback spelling get 403. This catches a Next upgrade
 * that changes the internals the bootstrap uses.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { request } from "node:http";
import { join, resolve } from "node:path";
import { contentSecurityPolicy, CSP_HEADER } from "../../lib/security/csp";
import { IMPORTED_NAMES } from "../env-file";
import { baseEnv } from "../env";
import { LISTEN_HOST, ORIGIN_HOST, TOKEN_HEADER } from "../shared";

const serverDir = resolve(process.argv[2] ?? join(import.meta.dirname, "..", ".stage", "server"));
const token = randomBytes(32).toString("base64url");
const demo = Object.fromEntries(IMPORTED_NAMES.map((name) => [name, ""]));

const child = spawn(process.env.WANHEDA_NODE || "node", ["wanheda-server.cjs"], {
  cwd: serverDir,
  env: { ...baseEnv(process.env), ...demo, WANHEDA_DESKTOP_TOKEN: token, PORT: "0", NEXT_TELEMETRY_DISABLED: "1" },
  stdio: ["ignore", "pipe", "inherit"],
});

/** Raw status code and CSP header: fetch() can't send a foreign Host header. */
function answer(port: number, headers: Record<string, string>): Promise<{ status: number; csp: string }> {
  return new Promise((done, fail) => {
    const req = request({ host: LISTEN_HOST, port, path: "/", headers }, (res) => {
      res.resume();
      const csp = res.headers[CSP_HEADER.toLowerCase()];
      done({ status: res.statusCode ?? 0, csp: typeof csp === "string" ? csp : "" });
    });
    req.on("error", fail);
    req.end();
  });
}

let failed = false;
try {
  const port = await new Promise<number>((done, fail) => {
    const timer = setTimeout(() => { fail(new Error("the server didn't report ready within 120 s")); }, 120_000);
    let buffer = "";
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      for (const line of buffer.split("\n")) {
        const report = /^\{"wanheda":(.*)\}\s*$/.exec(line.trim());
        if (!report?.[1]) continue;
        const message = JSON.parse(report[1]) as { type: string; port?: number; message?: string };
        clearTimeout(timer);
        if (message.type === "ready" && message.port) done(message.port);
        else fail(new Error(`server failed: ${message.message ?? "?"}`));
      }
      buffer = buffer.slice(buffer.lastIndexOf("\n") + 1);
    });
    child.once("exit", (code) => { fail(new Error(`server exited with code ${code}`)); });
  });

  const own = `${ORIGIN_HOST}:${port}`;
  const status = async (headers: Record<string, string>) => (await answer(port, headers)).status;
  const app = await answer(port, { host: own, [TOKEN_HEADER]: token });
  const checks: [string, number, number][] = [
    ["the app's request", app.status, 200],
    ["the CSP is sent (V67)", app.csp === contentSecurityPolicy() ? 1 : 0, 1],
    ["no token", await status({ host: own }), 403],
    ["wrong token", await status({ host: own, [TOKEN_HEADER]: randomBytes(32).toString("base64url") }), 403],
    ["foreign Host", await status({ host: "evil.test", [TOKEN_HEADER]: token }), 403],
    ["127.0.0.1 Host", await status({ host: `${LISTEN_HOST}:${port}`, [TOKEN_HEADER]: token }), 403],
  ];
  for (const [name, got, want] of checks) {
    console.log(`${got === want ? "ok  " : "FAIL"} ${name}: ${got} (want ${want})`);
    if (got !== want) failed = true;
  }
} catch (err) {
  console.error(err);
  failed = true;
} finally {
  child.kill();
}
process.exit(failed ? 1 : 0);
