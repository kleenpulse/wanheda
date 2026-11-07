import { create } from "zustand";
import { readTextFile } from "@/lib/reader/device";
import type { TextMessage, TextRequest, TextResponse } from "@/lib/reader/device-protocol";
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

/**
 * How each document's job ended this session, when it didn't leave the text
 * here: another tab is writing it (`busy`, look again soon), or it failed.
 * Read aloud says which (V48).
 */
const outcome = new Map<string, "busy" | "failed">();

/** Extraction progress by document while a PDF's job runs (pages read of all); gone when it ends. */
export const useTextProgress = create<Record<string, { done: number; total: number } | undefined>>(() => ({}));

function endProgress(sha256: string): void {
  if (!(sha256 in useTextProgress.getState())) return;
  useTextProgress.setState((s) => Object.fromEntries(Object.entries(s).filter(([k]) => k !== sha256)), true);
}

/** Why a document's text isn't here after its job, or null. */
export function textOutcome(sha256: string): "busy" | "failed" | null {
  return outcome.get(sha256) ?? null;
}

/**
 * The last document's parsed sentences. A long book's text.json runs to MBs (14k pages ≈ 19 MB), and parsing it
 * is a long task: done at idle after the open (primeText), never in a press on play (V50, T58).
 */
let parsed: { sha256: string; text: TextFile } | null = null;

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
    w.onmessage = (e: MessageEvent<TextMessage>) => {
      const msg = e.data;
      if ("type" in msg) {
        useTextProgress.setState({ [msg.sha256]: { done: msg.done, total: msg.total } });
        return;
      }
      const done = waiting.get(msg.id);
      waiting.delete(msg.id);
      done?.(msg);
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

/** Jobs in flight, so a second caller can wait on the same one. */
const jobs = new Map<string, Promise<void>>();

/**
 * Makes sure an opened document's sentences are on this device, in the
 * background. Cheap when they are: two small reads of the stored file, once
 * a session. Resolves when the job has settled (at once when there's
 * nothing to do), so the voice can pre-warm after it (V45). Never rejects.
 */
export function ensureText(doc: Pick<ReaderDoc, "sha256" | "kind">, file: File, demo: boolean): Promise<void> {
  const { sha256, kind } = doc;
  const running = jobs.get(sha256);
  if (running) return running;
  if (kind === "epub" || settled.has(sha256) || pending.has(sha256) || typeof Worker === "undefined") return Promise.resolve();
  pending.add(sha256);
  const gen = generation.get(sha256) ?? 0;
  const forgotten = () => (generation.get(sha256) ?? 0) !== gen;
  const job = (async () => {
    let settle = true;
    try {
      outcome.delete(sha256);
      if (demo ? inTab.has(sha256) : await storedIsCurrent(sha256)) return;
      const res = await post({ type: "extract", sha256, kind, file, keep: !demo });
      if (!res.ok) outcome.set(sha256, "failed");
      else if (res.status === "busy") outcome.set(sha256, "busy");
      // Another tab is writing it, or it was deleted on the way: look again next open.
      if (res.ok && (res.status === "busy" || res.status === "cancelled")) settle = false;
      if (res.ok && res.status === "done" && res.json !== null && demo && !forgotten()) inTab.set(sha256, res.json);
      // Written again: what was parsed before is stale.
      if (res.ok && res.status === "done" && parsed?.sha256 === sha256) parsed = null;
    } finally {
      endProgress(sha256);
      pending.delete(sha256);
      if (settle && !forgotten()) settled.add(sha256);
    }
  })()
    .catch(() => undefined)
    // Always after jobs.set below, even when the job finished without awaiting (demo text already in the tab).
    .finally(() => {
      if (jobs.get(sha256) === job) jobs.delete(sha256);
    });
  jobs.set(sha256, job);
  return job;
}

/** A document's sentences on this device, or null (not extracted yet, cut short, or an older extractor's). */
export async function readText(sha256: string, demo: boolean): Promise<TextFile | null> {
  if (parsed?.sha256 === sha256) return parsed.text;
  const gen = generation.get(sha256) ?? 0;
  let text: TextFile | null = null;
  if (demo) {
    const raw = inTab.get(sha256);
    text = raw ? parseTextFile(raw, sha256) : null;
  } else {
    const file = await readTextFile(sha256);
    if (!file) return null;
    try {
      text = parseTextFile(await file.text(), sha256);
    } catch {
      return null;
    }
  }
  // Forgotten while it was read: not kept.
  if (text && (generation.get(sha256) ?? 0) === gen) parsed = { sha256, text };
  return text;
}

/**
 * Parses a document's sentences at idle, after its text has settled (beside the voice's pre-warm, V45): play
 * then starts without the parse. The parse itself runs once the file is read, so the caller skips this while
 * another document is being read aloud (V50: no long task while speaking). Returns the cancel.
 */
export function primeText(sha256: string, demo: boolean, skip: () => boolean = () => false): () => void {
  if (typeof window === "undefined" || parsed?.sha256 === sha256) return () => undefined;
  const run = () => {
    if (!skip()) void readText(sha256, demo);
  };
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(run, { timeout: 5000 });
    return () => {
      window.cancelIdleCallback(id);
    };
  }
  const id = window.setTimeout(run, 0);
  return () => {
    window.clearTimeout(id);
  };
}

// A deleted (or unreadable) document's job stops, and its text goes with it.
onForget((sha256) => {
  generation.set(sha256, (generation.get(sha256) ?? 0) + 1);
  inTab.delete(sha256);
  settled.delete(sha256);
  if (parsed?.sha256 === sha256) parsed = null;
  worker?.w.postMessage({ type: "cancel", sha256 } satisfies TextRequest);
});
