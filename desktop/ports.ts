import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { LISTEN_HOST } from "./shared";

/*
 * The server's port is part of the app's origin, and OPFS, IndexedDB,
 * localStorage and cookies are per origin (voices, the outbox, prefs, the
 * session). So the port is chosen once, saved in desktop.json, and only
 * changes if something else holds it (SPEC V68).
 */

/** The saved port from desktop.json, if it is usable. */
export function parsePortRecord(text: string | null): number | null {
  if (!text) return null;
  try {
    const port: unknown = (JSON.parse(text) as { port?: unknown } | null)?.port;
    return typeof port === "number" && Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : null;
  } catch {
    return null;
  }
}

export function portRecord(port: number): string {
  return `${JSON.stringify({ port }, null, 2)}\n`;
}

function recordFile(userData: string): string {
  return join(userData, "desktop.json");
}

export function savedPort(userData: string): number | null {
  try {
    return parsePortRecord(readFileSync(recordFile(userData), "utf8"));
  } catch {
    return null;
  }
}

export function savePort(userData: string, port: number): void {
  const path = recordFile(userData);
  writeFileSync(`${path}.tmp`, portRecord(port));
  renameSync(`${path}.tmp`, path);
}

/** A port the OS says is free right now. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, LISTEN_HOST, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => {
        if (port) resolve(port);
        else reject(new Error("no free port"));
      });
    });
  });
}

export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => { resolve(false); });
    server.listen(port, LISTEN_HOST, () => server.close(() => { resolve(true); }));
  });
}
