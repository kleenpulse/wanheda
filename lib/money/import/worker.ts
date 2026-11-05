import { analyseStatement, readError, readSheet, type WorkerRequest, type WorkerResponse } from "./statement";

// The import worker (SPEC V32): a statement is read, mapped and keyed here, off
// the main thread, so a large spreadsheet never stalls the page. The cells of
// the last file are kept, so changing the account or a column re-maps without
// reading the file again.

// The worker's own global, typed by hand: the project's DOM lib and the webworker lib can't both load.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse) => void;
};

let last: { fileId: number; cells: string[][] } | null = null;

scope.onmessage = (event) => {
  const { id, fileId, bytes, options } = event.data;
  const reply = (r: WorkerResponse) => {
    scope.postMessage(r);
  };
  try {
    const data = new Uint8Array(bytes);
    if (last?.fileId !== fileId) last = { fileId, cells: readSheet(data) };
    analyseStatement(last.cells, data, options).then(
      (analysis) => {
        reply({ id, ok: true, analysis });
      },
      (error: unknown) => {
        reply({ id, ok: false, error: readError(error) });
      },
    );
  } catch (error) {
    last = null;
    reply({ id, ok: false, error: readError(error) });
  }
};
