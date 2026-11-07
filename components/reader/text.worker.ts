import { OPFS_DIR, textName, type TextMessage, type TextRequest, type TextResponse } from "@/lib/reader/device-protocol";
import { openFailure } from "@/lib/reader/pdf-password";
import { COMPLETE_TAIL, extractMarkdown, extractPdf, extractText, isCurrent, textFileHead, type Sentence } from "@/lib/reader/extract";

// The reader's text worker (T50, V44): a document's sentences with their
// places, worked out off the main thread after its first open and written
// beside its bytes in OPFS as `<sha256>.text.json` (R2 once it's on). One job
// at a time. Nothing here talks to the network except pdf.js's same-origin
// data (pdf/source.ts); the bytes never leave the device (V38).
//
// PDFs: pdf.js runs here, with its own worker nested under this one (handed
// over as a port, so pdf.js never looks for a window). Importing pdf.js's
// worker module into this scope instead would bind it to this worker's own
// messages.

// The worker's own global, typed by hand: the project's DOM lib and the webworker lib can't both load.
interface SyncHandle {
  write(buffer: ArrayBufferView, options?: { at?: number }): number;
  truncate(size: number): void;
  flush(): void;
  close(): void;
}
type WorkerFileHandle = FileSystemFileHandle & { createSyncAccessHandle?: () => Promise<SyncHandle> };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<TextRequest>) => void) | null;
  postMessage: (message: TextMessage) => void;
};

// ── Output ───────────────────────────────────────────────────────────────

/** Where the JSON goes: added to in order, written in chunks. */
interface Sink {
  add(text: string): void;
  /** Writes the rest. Resolves to the JSON when it was kept in memory. */
  finish(): Promise<string | null>;
  /** Drops what was written. */
  abort(): Promise<void>;
}

const CHUNK = 256 * 1024;

function memorySink(): Sink {
  const parts: string[] = [];
  return {
    add: (t) => parts.push(t),
    finish: () => Promise.resolve(parts.join("")),
    abort: () => Promise.resolve(),
  };
}

/** Into OPFS. A sync access handle where there is one (it also locks the file); else a writable, which only replaces the file when closed. */
async function fileSink(dir: FileSystemDirectoryHandle, name: string): Promise<Sink> {
  const handle = (await dir.getFileHandle(name, { create: true })) as WorkerFileHandle;
  const enc = new TextEncoder();
  let buf = "";
  if (handle.createSyncAccessHandle) {
    const sync = await handle.createSyncAccessHandle();
    sync.truncate(0);
    let at = 0;
    const write = () => {
      at += sync.write(enc.encode(buf), { at });
      buf = "";
    };
    return {
      add(t) {
        buf += t;
        if (buf.length >= CHUNK) write();
      },
      finish() {
        write();
        sync.flush();
        sync.close();
        return Promise.resolve(null);
      },
      async abort() {
        try {
          sync.close();
        } catch {
          // Closed already.
        }
        await dir.removeEntry(name).catch(() => undefined);
      },
    };
  }
  const out = await handle.createWritable();
  let chain: Promise<void> = Promise.resolve();
  const write = () => {
    const bytes = enc.encode(buf);
    buf = "";
    chain = chain.then(() => out.write(bytes));
  };
  return {
    add(t) {
      buf += t;
      if (buf.length >= CHUNK) write();
    },
    async finish() {
      write();
      await chain;
      await out.close();
      return null;
    },
    async abort() {
      await chain.catch(() => undefined);
      await out.abort().catch(() => undefined);
    },
  };
}

/** Whether the file already holds this extractor's finished output: its first and last bytes only. */
async function storedIsCurrent(dir: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    const file = await (await dir.getFileHandle(name)).getFile();
    if (file.size < COMPLETE_TAIL.length + 16) return false;
    const [head, tail] = await Promise.all([file.slice(0, 64).text(), file.slice(file.size - COMPLETE_TAIL.length).text()]);
    return isCurrent(head, tail);
  } catch {
    return false;
  }
}

// ── Extraction ───────────────────────────────────────────────────────────

/** Progress goes out at most this often: a page a millisecond would flood the page's thread. */
const PROGRESS_MS = 150;

function progressTo(sha256: string): (done: number, total: number) => void {
  let last = 0;
  return (done, total) => {
    const now = performance.now();
    if (now - last < PROGRESS_MS && done < total) return;
    last = now;
    scope.postMessage({ type: "progress", sha256, done, total });
  };
}

async function extractPdfFile(
  file: File,
  password: string | undefined,
  emit: (s: Sentence) => void,
  signal: AbortSignal,
  onPage: (done: number, total: number) => void,
): Promise<void> {
  const [pdfjs, { pdfParams }] = await Promise.all([import("pdfjs-dist"), import("./pdf/source")]);
  // The reader's own pdf.js worker asset (engine.ts), started from here.
  const src = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url);
  const port = new Worker(src, { type: "module", name: "reader-text-pdf" });
  const worker = pdfjs.PDFWorker.create({ port });
  const read = { failed: false };
  const task = pdfjs.getDocument({
    ...(await pdfParams(
      file,
      () => {
        // The file went away under the job (deleted, replaced): pdf.js would wait for that range forever.
        read.failed = true;
        void task.destroy();
      },
      password,
    )),
    worker,
    disableFontFace: true,
  });
  const stop = () => {
    void task.destroy();
  };
  signal.addEventListener("abort", stop, { once: true });
  try {
    const pdf = await task.promise;
    await extractPdf(pdf, emit, signal, onPage);
    if (read.failed) throw new Error("file read failed");
  } finally {
    signal.removeEventListener("abort", stop);
    await task.destroy().catch(() => undefined);
    worker.destroy();
    port.terminate();
  }
}

async function extract(req: TextRequest & { type: "extract" }, emit: (s: Sentence) => void, signal: AbortSignal): Promise<void> {
  if (req.kind === "pdf") {
    await extractPdfFile(req.file, req.password, emit, signal, progressTo(req.sha256));
    return;
  }
  // The reader reads Markdown and text the same way (md-reader.tsx: File.text, UTF-8).
  const text = await req.file.text();
  if (req.kind === "txt") {
    extractText(text, emit, signal);
    return;
  }
  const { mdTree } = await import("@/lib/reader/md-pipeline");
  extractMarkdown(mdTree(text), emit, signal);
}

async function exists(dir: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch (error) {
    return !(error instanceof DOMException && error.name === "NotFoundError");
  }
}

function isAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

/** Jobs not finished yet, by hash: a delete cancels its job, queued or running. */
const jobs = new Map<string, AbortController>();

async function run(req: TextRequest & { type: "extract" }, signal: AbortSignal): Promise<TextResponse> {
  const { id, sha256, kind, keep } = req;
  let dir: FileSystemDirectoryHandle | null = null;
  const name = textName(sha256);
  if (keep) {
    const root = await navigator.storage.getDirectory();
    dir = await root.getDirectoryHandle(OPFS_DIR);
    if (await storedIsCurrent(dir, name)) return { id, ok: true, status: "current" };
  }
  if (signal.aborted) return { id, ok: true, status: "cancelled" };
  const sink = dir ? await fileSink(dir, name) : memorySink();
  let count = 0;
  try {
    sink.add(textFileHead(kind, sha256));
    await extract(
      req,
      (s) => {
        sink.add((count++ === 0 ? "" : ",") + JSON.stringify(s));
      },
      signal,
    );
    // Read again: a cancel lands while the job awaits.
    if (isAborted(signal)) {
      await sink.abort();
      return { id, ok: true, status: "cancelled" };
    }
    sink.add(COMPLETE_TAIL);
    const json = await sink.finish();
    // The document may have been deleted while this ran (a Markdown parse and its write never yield, so a
    // cancel can't land; another tab's delete never reaches this one), and its own removal of the text
    // failed on this job's lock. The bytes go first (removeDeviceFile), so with them gone, so is the text.
    if (dir && (isAborted(signal) || !(await exists(dir, sha256)))) {
      await dir.removeEntry(name).catch(() => undefined);
      return { id, ok: true, status: "cancelled" };
    }
    return { id, ok: true, status: "done", sentences: count, json };
  } catch (error) {
    await sink.abort();
    throw error;
  }
}

/** One tab at a time per document: another tab already on it means this one has nothing to do. */
async function locked(req: TextRequest & { type: "extract" }, signal: AbortSignal): Promise<TextResponse> {
  // Missing in older browsers: then the sync handle's own lock is the only guard.
  const locks = (navigator as { locks?: LockManager }).locks;
  if (!req.keep || !locks) return run(req, signal);
  return locks.request(`wanheda-reader-text:${req.sha256}`, { ifAvailable: true }, (lock) =>
    lock ? run(req, signal) : ({ id: req.id, ok: true, status: "busy" } as const),
  );
}

let queue: Promise<void> = Promise.resolve();

scope.onmessage = (event) => {
  const req = event.data;
  if (req.type === "cancel") {
    jobs.get(req.sha256)?.abort();
    return;
  }
  const ac = new AbortController();
  jobs.get(req.sha256)?.abort();
  jobs.set(req.sha256, ac);
  queue = queue.then(async () => {
    let res: TextResponse;
    try {
      res = await locked(req, ac.signal);
    } catch (error) {
      res = openFailure(error) === "broken" ? { id: req.id, ok: false } : { id: req.id, ok: false, locked: true };
    }
    if (jobs.get(req.sha256) === ac) jobs.delete(req.sha256);
    scope.postMessage(res);
  });
};
