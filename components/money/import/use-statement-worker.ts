"use client";

import * as React from "react";
import type { AnalyseOptions, WorkerRequest, WorkerResponse } from "@/lib/money/import/statement";

type Waiting = Map<number, (r: WorkerResponse) => void>;

/**
 * Reads a statement in the import worker (SPEC V32), never on the main
 * thread. The worker starts on the first file and stops with the page. If it
 * dies, every call waiting on it gets an error and the next call starts a
 * fresh one.
 */
export function useStatementWorker() {
  const ref = React.useRef<{ worker: Worker; next: number; waiting: Waiting } | null>(null);

  React.useEffect(
    () => () => {
      ref.current?.worker.terminate();
      ref.current = null;
    },
    [],
  );

  return React.useCallback((fileId: number, bytes: ArrayBuffer, options: AnalyseOptions): Promise<WorkerResponse> => {
    if (!ref.current) {
      const worker = new Worker(new URL("../../../lib/money/import/worker.ts", import.meta.url), { type: "module", name: "statement-import" });
      const waiting: Waiting = new Map();
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const done = waiting.get(e.data.id);
        waiting.delete(e.data.id);
        done?.(e.data);
      };
      worker.onerror = () => {
        for (const [id, done] of waiting) done({ id, ok: false, error: "The file reader stopped. Try the file again." });
        waiting.clear();
        worker.terminate();
        if (ref.current?.worker === worker) ref.current = null;
      };
      ref.current = { worker, next: 1, waiting };
    }
    const w = ref.current;
    const id = w.next++;
    return new Promise((resolve) => {
      w.waiting.set(id, resolve);
      // The bytes are copied, not moved: the page keeps them to re-map with another account or column.
      w.worker.postMessage({ id, fileId, bytes, options } satisfies WorkerRequest);
    });
  }, []);
}
