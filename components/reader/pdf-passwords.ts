import Dexie, { type Table } from "dexie";
import { PdfPasswords, type PasswordBackend } from "@/lib/reader/pdf-password";

// The device's PDF passwords (V40): a small IndexedDB database of its own,
// `wanheda-reader-keys`, so the reader's main store never carries them. Demo
// keeps them in this tab's memory only. No pdf.js in here: the text job
// (text.ts) reads it too.

interface PasswordRow {
  sha256: string;
  password: string;
}

let backend: Promise<PasswordBackend | null> | null = null;

function device(): Promise<PasswordBackend | null> {
  backend ??= (async () => {
    if (typeof indexedDB === "undefined") return null;
    const db = new Dexie("wanheda-reader-keys") as Dexie & { pdfPasswords: Table<PasswordRow, string> };
    db.version(1).stores({ pdfPasswords: "sha256" });
    await db.open();
    return {
      get: async (sha256) => (await db.pdfPasswords.get(sha256))?.password,
      put: async (sha256, password) => {
        await db.pdfPasswords.put({ sha256, password });
      },
      delete: (sha256) => db.pdfPasswords.delete(sha256),
    } satisfies PasswordBackend;
  })().catch(() => null);
  return backend;
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
