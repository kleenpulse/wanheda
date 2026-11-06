// Module-level caches keep a document ready for an instant reopen (V24): the
// last bytes read (document-view.tsx), the last PDF loaded (pdf/pdf-reader.tsx)
// and the PDF the engine holds open (pdf/engine.ts). Each registers here how
// to drop what it keeps for a hash, and a delete drops it everywhere, so a
// later add of the same file never reopens stale bytes or a destroyed
// document. No pdf.js in here: the library imports it.

const forgetters = new Set<(sha256: string) => void>();

/** Registers how one cache drops a hash. Returns the unregister function. */
export function onForget(fn: (sha256: string) => void): () => void {
  forgetters.add(fn);
  return () => {
    forgetters.delete(fn);
  };
}

/** Drops every cached copy of a document's bytes and its open PDF. */
export function forgetDoc(sha256: string): void {
  for (const fn of forgetters) fn(sha256);
}
