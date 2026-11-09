import type Dexie from "dexie";
import type { Table } from "dexie";
import { openScopedDexie } from "@/lib/device/dexie";
import { deviceScope } from "@/lib/device/scope";
import { PdfPasswords, type PasswordBackend } from "@/lib/reader/pdf-password";

// The device's PDF passwords (V40): a small IndexedDB database of its own,
// `wanheda-reader-keys`, so the reader's main store never carries them. Demo
// keeps them in this tab's memory only. No pdf.js in here: the text job
// (text.ts) reads it too.

interface PasswordRow {
  sha256: string;
  password: string;
}

let backend: { scope: string; store: Promise<PasswordBackend | null> } | null = null;

/** This account's remembered passwords (`wanheda-reader-keys@<scope>`, ADR-0015); reopens if the account changes. */
function device(): Promise<PasswordBackend | null> {
  const scope = deviceScope();
  if (!scope || typeof indexedDB === "undefined") return Promise.resolve(null);
  if (backend?.scope !== scope.id) backend = { scope: scope.id, store: openPasswords() };
  return backend.store;
}

function openPasswords(): Promise<PasswordBackend | null> {
  return (async () => {
    const db = await openScopedDexie<Dexie & { pdfPasswords: Table<PasswordRow, string> }>("wanheda-reader-keys", (d) => {
      d.version(1).stores({ pdfPasswords: "sha256" });
    });
    return {
      get: async (sha256) => (await db.pdfPasswords.get(sha256))?.password,
      put: async (sha256, password) => {
        await db.pdfPasswords.put({ sha256, password });
      },
      delete: (sha256) => db.pdfPasswords.delete(sha256),
    } satisfies PasswordBackend;
  })().catch(() => null);
}

const owner = new PdfPasswords(device);
const demo = new PdfPasswords(() => Promise.resolve(null));

/** The store for this account: the owner's remembers on the device, demo's only in the tab. */
export function pdfPasswords(isDemo: boolean): PdfPasswords {
  return isDemo ? demo : owner;
}

/**
 * A deleted document's password goes with it. Only on delete: a read that
 * breaks (the device copy went away for now) keeps it for the relink.
 */
export function forgetPdfPassword(sha256: string): void {
  void owner.forget(sha256);
  void demo.forget(sha256);
}
