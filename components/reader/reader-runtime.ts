import type { QueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { MemoryReaderStore, openReaderStore, type ReaderLocalStore } from "@/lib/reader/local";
import { READER_KEY, withProgress, type ProgressReply, type ProgressWrite, type ReaderPayload } from "@/lib/reader/reader";

/*
  Reading positions on the client (SPEC V41). A position shows at once in the
  library cache and goes into the device queue (lib/reader/local.ts); it is
  sent 2 s after the reader stops moving, on focus, on reconnect, on a 30 s
  tick while anything waits, and by sendBeacon when the page goes away. It
  leaves the queue only on the server's answer. Newer `at` wins on both
  sides, so a resend, a stale tab or a second device can't move a position
  back. Lives in the shell, so a position queued offline is sent from any page.

  The runtime also keeps the last library on the device and paints from it
  on a cold start (V24), before the server answers.
*/

const DEBOUNCE_MS = 2_000;
const TICK_MS = 30_000;
const SNAPSHOT_MS = 1_000;
const ENDPOINT = "/api/reader/progress";

/** Positions not yet confirmed, by document: laid over the cache so a refetch can't roll one back. */
export const usePendingProgress = create<{ byDoc: Readonly<Record<string, ProgressWrite>> }>(() => ({ byDoc: {} }));

function setPending(w: ProgressWrite) {
  usePendingProgress.setState((s) => {
    const held = s.byDoc[w.documentId];
    return held && held.at >= w.at ? s : { byDoc: { ...s.byDoc, [w.documentId]: w } };
  });
}

function clearPending(w: ProgressWrite) {
  usePendingProgress.setState((s) => {
    if (s.byDoc[w.documentId]?.at !== w.at) return s;
    const { [w.documentId]: _done, ...rest } = s.byDoc;
    return { byDoc: rest };
  });
}

/** The library with every unconfirmed position laid over (each only if newer). */
export function withPending(payload: ReaderPayload, pending: Readonly<Record<string, ProgressWrite>>): ReaderPayload {
  let out = payload;
  for (const w of Object.values(pending)) out = withProgress(out, w.documentId, { locator: w.locator, percent: w.percent, at: w.at });
  return out;
}

export interface ReaderRuntime {
  /** A new reading position: into the cache now, to the server soon. */
  report(w: ProgressWrite): void;
  /** Starts listeners and the first send; returns the stop function. */
  start(): () => void;
}

export function createReaderRuntime(qc: QueryClient, demo: boolean): ReaderRuntime {
  let storePromise: Promise<ReaderLocalStore> | null = null;
  const store = () =>
    (storePromise ??= demo ? Promise.resolve(new MemoryReaderStore()) : openReaderStore().catch(() => new MemoryReaderStore()));
  let timer: ReturnType<typeof setTimeout> | null = null;
  let sending = false;
  let again = false;

  const fold = (w: ProgressWrite) => {
    qc.setQueryData<ReaderPayload>(READER_KEY, (p) => (p ? withProgress(p, w.documentId, { locator: w.locator, percent: w.percent, at: w.at }) : p));
  };

  async function send(w: ProgressWrite): Promise<"done" | "keep"> {
    let res: Response;
    try {
      res = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(w), credentials: "same-origin" });
    } catch {
      return "keep";
    }
    // Gone (deleted elsewhere) or refused: retrying can never land it.
    if (res.status === 404 || res.status === 400 || res.status === 413) return "done";
    if (!res.ok) return "keep";
    const body = (await res.json().catch(() => null)) as ProgressReply | null;
    if (!body?.ok) return "keep";
    // `stale`: the server holds a newer position (another device); show it.
    qc.setQueryData<ReaderPayload>(READER_KEY, (p) => (p ? withProgress(p, w.documentId, body.progress) : p));
    return "done";
  }

  async function flush(): Promise<void> {
    if (demo) return;
    if (sending) {
      again = true;
      return;
    }
    sending = true;
    try {
      do {
        again = false;
        const s = await store();
        for (const w of await s.pending()) {
          if ((await send(w)) === "done") {
            await s.settle(w);
            clearPending(w);
          } else {
            return;
          }
        }
        // Set by a flush() call made while this one was awaiting the server.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      } while (again);
    } finally {
      sending = false;
    }
  }

  function schedule(ms: number) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, ms);
  }

  /** The page is going away: hand every waiting position to the browser. They stay queued until answered. */
  function beacon() {
    if (demo || typeof navigator.sendBeacon !== "function") return;
    for (const w of Object.values(usePendingProgress.getState().byDoc)) {
      navigator.sendBeacon(ENDPOINT, new Blob([JSON.stringify(w)], { type: "text/plain" }));
    }
  }

  return {
    report(w) {
      fold(w);
      if (demo) return;
      setPending(w);
      void store()
        .then((s) => s.put(w))
        .then(() => {
          schedule(DEBOUNCE_MS);
        });
    },

    start() {
      const offs: (() => void)[] = [];
      const on = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void) => {
        window.addEventListener(type, fn);
        offs.push(() => {
          window.removeEventListener(type, fn);
        });
      };

      if (!demo) {
        // Device first (V24, V41): the last library and any positions still queued.
        void store().then(async (s) => {
          const [snapshot, pending] = await Promise.all([s.loadSnapshot(), s.pending()]);
          for (const w of pending) setPending(w);
          // Marked old, so the query still asks the server at once.
          if (snapshot && !qc.getQueryData(READER_KEY)) qc.setQueryData(READER_KEY, snapshot, { updatedAt: 0 });
          void flush();
        });

        let saveTimer: ReturnType<typeof setTimeout> | null = null;
        const unsubscribe = qc.getQueryCache().subscribe((event) => {
          if (event.type !== "updated" || (event.query.queryKey as readonly unknown[])[0] !== READER_KEY[0]) return;
          if (saveTimer) clearTimeout(saveTimer);
          saveTimer = setTimeout(() => {
            const data = qc.getQueryData<ReaderPayload>(READER_KEY);
            if (data?.source === "owner") void store().then((s) => s.saveSnapshot(data));
          }, SNAPSHOT_MS);
        });
        offs.push(unsubscribe, () => {
          if (saveTimer) clearTimeout(saveTimer);
        });

        on("online", () => void flush());
        on("focus", () => void flush());
        on("pagehide", beacon);
        const onVisible = () => {
          if (document.visibilityState === "hidden") beacon();
          else void flush();
        };
        document.addEventListener("visibilitychange", onVisible);
        offs.push(() => {
          document.removeEventListener("visibilitychange", onVisible);
        });
        const tick = setInterval(() => {
          if (Object.keys(usePendingProgress.getState().byDoc).length > 0) void flush();
        }, TICK_MS);
        offs.push(() => {
          clearInterval(tick);
        });
      }

      return () => {
        for (const off of offs) off();
        if (timer) clearTimeout(timer);
      };
    },
  };
}
