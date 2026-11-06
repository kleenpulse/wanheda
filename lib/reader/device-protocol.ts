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
