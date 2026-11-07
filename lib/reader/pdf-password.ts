// Password-protected PDFs (V40): why an open failed, and where a PDF's
// password is kept. The password is the owner's secret: it lives on this
// device only (IndexedDB when "Remember on this device" is ticked, otherwise
// this tab's memory), never on the server, in text.json, a log, a toast or an
// error message, and it goes when the document is deleted. No imports, so the
// text worker can use the classifier.

/** Why pdf.js couldn't open a document: it needs a password, the one given is wrong, or it's unreadable. */
export type OpenFailure = "need-password" | "wrong-password" | "broken";

/** pdf.js rejects a locked document with a PasswordException: code 1 needs a password, code 2 had a wrong one. */
export function openFailure(error: unknown): OpenFailure {
  if (typeof error !== "object" || error === null) return "broken";
  const { name, code } = error as { name?: unknown; code?: unknown };
  if (name !== "PasswordException") return "broken";
  return code === 2 ? "wrong-password" : "need-password";
}

/** Where remembered passwords are kept (Dexie for the owner). Every call may fail: the caller treats that as "not kept". */
export interface PasswordBackend {
  get(sha256: string): Promise<string | undefined>;
  put(sha256: string, password: string): Promise<void>;
  delete(sha256: string): Promise<void>;
}

/** Passwords by document hash: this tab's memory first, then the device (when there is one). */
export class PdfPasswords {
  readonly #memory = new Map<string, string>();
  readonly #device: () => Promise<PasswordBackend | null>;

  constructor(device: () => Promise<PasswordBackend | null>) {
    this.#device = device;
  }

  async get(sha256: string): Promise<string | undefined> {
    const inTab = this.#memory.get(sha256);
    if (inTab !== undefined) return inTab;
    const device = await this.#device().catch(() => null);
    const kept = await device?.get(sha256).catch(() => undefined);
    if (kept !== undefined) this.#memory.set(sha256, kept);
    return kept;
  }

  /** A password that just opened the document. `remember` false: this tab only, and any copy on the device goes. */
  async keep(sha256: string, password: string, remember: boolean): Promise<void> {
    this.#memory.set(sha256, password);
    const device = await this.#device().catch(() => null);
    if (!device) return;
    await (remember ? device.put(sha256, password) : device.delete(sha256)).catch(() => undefined);
  }

  /** Drops a document's password everywhere: it was deleted, or the kept password no longer opens it. */
  async forget(sha256: string): Promise<void> {
    this.#memory.delete(sha256);
    const device = await this.#device().catch(() => null);
    await device?.delete(sha256).catch(() => undefined);
  }
}
