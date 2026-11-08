import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { knownValues, type Imported } from "./env-file";

/*
 * The imported `.env` values (SPEC V69), sealed by the OS keychain (Electron
 * safeStorage, async) in userData `secrets.json`: a versioned envelope,
 * written atomically. They are unsealed only in main and handed to the
 * server's environment; never written in plain text, sent to a page or logged.
 *
 * An empty record means the owner chose demo mode, so the app doesn't ask
 * again at every start. A file that can't be opened is never replaced
 * silently: main asks Quit or Start fresh, and the old file is kept.
 */

export interface Sealer {
  /** Which keychain seals the data ("win32", or the Linux backend). */
  readonly backend: string;
  /** False when nothing really encrypts (Linux basic_text). Then nothing is saved. */
  readonly protects: boolean;
  seal(text: string): Promise<Buffer>;
  open(sealed: Buffer): Promise<{ text: string; reseal: boolean }>;
}

export interface SecretStore {
  read(): Buffer | null;
  write(data: Buffer): void;
  /** Moves an unreadable file aside, keeping it for the owner. */
  keepBroken(): void;
  remove(): void;
}

export type LoadResult =
  | { kind: "none" }
  | { kind: "ok"; values: Imported }
  | { kind: "keychain-changed"; was: string; now: string }
  | { kind: "keychain-unavailable"; backend: string }
  | { kind: "damaged" };

type Envelope = { v: 1; backend: string; data: string };

export class NoKeychainError extends Error {
  constructor(backend: string) {
    super(`no keychain to seal with (${backend})`);
  }
}

export async function loadSecrets(store: SecretStore, sealer: Sealer): Promise<LoadResult> {
  const raw = store.read();
  if (!raw) return { kind: "none" };
  const envelope = parseEnvelope(raw);
  if (!envelope) return { kind: "damaged" };
  if (envelope.backend !== sealer.backend) return { kind: "keychain-changed", was: envelope.backend, now: sealer.backend };
  if (!sealer.protects) return { kind: "keychain-unavailable", backend: sealer.backend };
  let opened: { text: string; reseal: boolean };
  try {
    opened = await sealer.open(Buffer.from(envelope.data, "base64"));
  } catch {
    return { kind: "damaged" };
  }
  let values: Imported | null;
  try {
    values = knownValues(JSON.parse(opened.text));
  } catch {
    values = null;
  }
  if (!values) return { kind: "damaged" };
  if (opened.reseal) await saveSecrets(store, sealer, values);
  return { kind: "ok", values };
}

/** Seals and saves `values`. Throws NoKeychainError rather than write plain text. */
export async function saveSecrets(store: SecretStore, sealer: Sealer, values: Imported): Promise<void> {
  if (!sealer.protects) throw new NoKeychainError(sealer.backend);
  const sealed = await sealer.seal(JSON.stringify(values));
  const envelope: Envelope = { v: 1, backend: sealer.backend, data: sealed.toString("base64") };
  store.write(Buffer.from(`${JSON.stringify(envelope)}\n`));
}

function parseEnvelope(raw: Buffer): Envelope | null {
  try {
    const value = JSON.parse(raw.toString("utf8")) as Partial<Envelope> | null;
    if (!value || value.v !== 1 || typeof value.backend !== "string" || typeof value.data !== "string") return null;
    return { v: 1, backend: value.backend, data: value.data };
  } catch {
    return null;
  }
}

/** secrets.json in userData: written atomically, readable by the owner only. */
export function fileStore(path: string): SecretStore {
  return {
    read() {
      try {
        return readFileSync(path);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw err;
      }
    },
    write(data) {
      const tmp = `${path}.tmp`;
      writeFileSync(tmp, data, { mode: 0o600 });
      renameSync(tmp, path);
    },
    keepBroken() {
      try {
        renameSync(path, `${path}.broken-${new Date().toISOString().replace(/[:.]/g, "-")}`);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }
    },
    remove() {
      rmSync(path, { force: true });
    },
  };
}
