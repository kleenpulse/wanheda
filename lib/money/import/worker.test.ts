import { afterAll, describe, expect, it, vi } from "vitest";
import type { WorkerRequest, WorkerResponse } from "./statement";

// The import worker's message loop (V32), with `self` stubbed: replies carry
// the request id, the last file's cells are reused, and a bad file replies
// with a readable error instead of throwing.

const posted: WorkerResponse[] = [];
const scope: { onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null; postMessage: (m: WorkerResponse) => void } = {
  onmessage: null,
  postMessage: (m) => {
    posted.push(m);
  },
};
vi.stubGlobal("self", scope);
const statement = await import("./statement");
const readSheet = vi.spyOn(statement, "readSheet");
await import("./worker");

afterAll(() => {
  vi.unstubAllGlobals();
});

const CSV = "Date,Description,Amount\n08/10/2026,NETFLIX.COM,\"-4,400.00\"\n";
const options = { accountId: "0b9e1c4e-6f0a-4c39-9a51-2f8d7c3b1a11", currency: "NGN" as const, saved: [], mapping: null };

async function send(id: number, fileId: number, text: string): Promise<WorkerResponse> {
  const bytes = new TextEncoder().encode(text).buffer;
  scope.onmessage?.({ data: { id, fileId, bytes, options } } as unknown as MessageEvent<WorkerRequest>);
  await vi.waitFor(() => {
    expect(posted.some((p) => p.id === id)).toBe(true);
  });
  return posted.find((p) => p.id === id) as WorkerResponse;
}

describe("import worker", () => {
  it("analyses a statement and answers with the request id", async () => {
    const r = await send(1, 10, CSV);
    expect(r.ok).toBe(true);
    expect(r.ok && r.analysis.rows.map((row) => [row.postedOn, row.amountMinor, row.payee])).toEqual([["2026-10-08", -440_000, "NETFLIX.COM"]]);
  });

  it("reuses the last file's cells for a re-map, and reads a new file", async () => {
    const before = readSheet.mock.calls.length;
    await send(2, 10, CSV);
    expect(readSheet.mock.calls.length).toBe(before);
    await send(3, 11, CSV);
    expect(readSheet.mock.calls.length).toBe(before + 1);
  });

  it("replies with a readable error for a file it can't read", async () => {
    const r = await send(4, 12, "%PDF-1.7 binary");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.length).toBeGreaterThan(0);
  });
});
