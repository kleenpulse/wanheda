import { readTextFile } from "@/lib/reader/device";
import type { TextRequest, TextResponse } from "@/lib/reader/device-protocol";
import { COMPLETE_TAIL, isCurrent, parseTextFile, type TextFile } from "@/lib/reader/extract";
import type { ReaderDoc } from "@/lib/reader/reader";
import { onForget } from "./doc-cache";

// A document's sentences for voice (T50, V44), from the page's side: after a
// document is first opened on this device, the text worker extracts them and
// keeps them beside its bytes (`<sha256>.text.json` in OPFS; demo: this tab).
// Extracted again only when the file is missing, cut short, or made by an
// older extractor. Phase 6 reads them with readText.

/** Demo documents live in this tab (use-reader.ts), so their text does too. */
const inTab = new Map<string, string>();
/** Looked at this session and nothing left to do (current, done, or failed: a file that breaks the extractor isn't retried until reload). */
const settled = new Set<string>();
const pending = new Set<string>();
/** Bumped when a document is forgotten (deleted, unreadable): a job that started before it is dropped, not kept. */
const generation = new Map<string, number>();

let worker: { w: Worker; next: number; waiting: Map<number, (r: TextResponse) => void> } | null = null;

/** The worker lives only while it has work: done, it goes, and pdf.js and the text go with it. */
function post(req: Omit<TextRequest & { type: "extract" }, "id">): Promise<TextResponse> {
  if (!worker) {
    const w = new Worker(new URL("./text.worker.ts", import.meta.url), { type: "module", name: "reader-text" });
    const waiting = new Map<number, (r: TextResponse) => void>();
    const current = { w, next: 1, waiting };
    const idle = () => {
      if (waiting.size > 0 || worker !== current) return;
      w.terminate();
      worker = null;
    };
    w.onmessage = (e: MessageEvent<TextResponse>) => {
      const done = waiting.get(e.data.id);
      waiting.delete(e.data.id);
      done?.(e.data);
      idle();
    };
    w.onerror = () => {
      for (const [id, done] of waiting) done({ id, ok: false });
      waiting.clear();
      w.terminate();
      if (worker === current) worker = null;
    };
    worker = current;
  }
  const current = worker;
  const id = current.next++;
  return new Promise((resolve) => {
    current.waiting.set(id, resolve);
    current.w.postMessage({ ...req, id } satisfies TextRequest);
  });
}

async function storedIsCurrent(sha256: string): Promise<boolean> {
  const file = await readTextFile(sha256);
  if (!file || file.size < COMPLETE_TAIL.length + 16) return false;
  try {
    const [head, tail] = await Promise.all([file.slice(0, 64).text(), file.slice(file.size - COMPLETE_TAIL.length).text()]);
    return isCurrent(head, tail);
  } catch {
    return false;
  }
}

/**
 * Makes sure an opened document's sentences are on this device, in the
 * background. Cheap when they are: two small reads of the stored file, once
 * a session.
 */
export function ensureText(doc: Pick<ReaderDoc, "sha256" | "kind">, file: File, demo: boolean): void {
  const { sha256, kind } = doc;
  if (kind === "epub" || settled.has(sha256) || pending.has(sha256) || typeof Worker === "undefined") return;
  pending.add(sha256);
  const gen = generation.get(sha256) ?? 0;
  const forgotten = () => (generation.get(sha256) ?? 0) !== gen;
  void (async () => {
    let settle = true;
    try {
      if (demo ? inTab.has(sha256) : await storedIsCurrent(sha256)) return;
      const res = await post({ type: "extract", sha256, kind, file, keep: !demo });
      // Another tab is writing it, or it was deleted on the way: look again next open.
      if (res.ok && (res.status === "busy" || res.status === "cancelled")) settle = false;
      if (res.ok && res.status === "done" && res.json !== null && demo && !forgotten()) inTab.set(sha256, res.json);
    } finally {
      pending.delete(sha256);
      if (settle && !forgotten()) settled.add(sha256);
    }
  })();
}

/** A document's sentences on this device, or null (not extracted yet, cut short, or an older extractor's). */
export async function readText(sha256: string, demo: boolean): Promise<TextFile | null> {
  if (demo) {
    const raw = inTab.get(sha256);
    return raw ? parseTextFile(raw, sha256) : null;
  }
  const file = await readTextFile(sha256);
  if (!file) return null;
  try {
    return parseTextFile(await file.text(), sha256);
  } catch {
    return null;
  }
}

// A deleted (or unreadable) document's job stops, and its text goes with it.
onForget((sha256) => {
  generation.set(sha256, (generation.get(sha256) ?? 0) + 1);
  inTab.delete(sha256);
  settled.delete(sha256);
  worker?.w.postMessage({ type: "cancel", sha256 } satisfies TextRequest);
});
