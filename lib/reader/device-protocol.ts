// Shared by the file worker and the page: the OPFS folder and the messages
// between them. No imports, so the worker bundle stays small.

/** The reader's folder in this origin's OPFS. Files are named by their sha256. */
export const OPFS_DIR = "wanheda-reader";

export type StoreError = "unavailable" | "quota" | "failed";

export interface HashRequest {
  id: number;
  file: File;
  /** Also write the bytes into OPFS under their hash. */
  keep: boolean;
  /** With `keep`: write only if the hash is this one (a relink), so a wrong file leaves nothing behind. */
  expect?: string;
}

export type HashResponse =
  | { id: number; ok: true; sha256: string; size: number; stored: boolean; storeError: StoreError | null }
  | { id: number; ok: false };

/** Lower-case hex of a digest. */
export function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = "";
  for (const b of view) out += b.toString(16).padStart(2, "0");
  return out;
}

/** A document's sentences for voice (T50, V44), beside its bytes. Never a bare hash, so listDeviceFiles leaves it out. */
export function textName(sha256: string): string {
  return `${sha256}.text.json`;
}

export type TextDocKind = "pdf" | "md" | "txt";

export type TextRequest =
  | {
      type: "extract";
      id: number;
      sha256: string;
      kind: TextDocKind;
      file: File;
      /** Write `<sha256>.text.json` into OPFS (owner). False: send the JSON back instead (demo keeps it in the tab). */
      keep: boolean;
    }
  | { type: "cancel"; sha256: string };

export type TextResponse =
  | { id: number; ok: true; status: "done"; sentences: number; json: string | null }
  /** Already there and current, or another tab is writing it, or cancelled (deleted) on the way. */
  | { id: number; ok: true; status: "current" | "busy" | "cancelled" }
  | { id: number; ok: false };
