import { beforeEach, describe, expect, it, vi } from "vitest";
import { COMPLETE_TAIL, textFileHead } from "@/lib/reader/extract";

// T58 (V50): a long book's text.json is parsed once and kept, so a press on play doesn't parse 19 MB again.

const files = new Map<string, string>();
const reads = vi.fn();
vi.mock("@/lib/reader/device", () => ({
  readTextFile: (sha256: string) => {
    reads(sha256);
    const raw = files.get(sha256);
    return Promise.resolve(raw === undefined ? null : new File([raw], `${sha256}.text.json`));
  },
}));

const { readText } = await import("./text");
const { forgetDoc } = await import("./doc-cache");

const stored = (sha256: string, texts: string[]) =>
  textFileHead("txt", sha256) + texts.map((text, i) => JSON.stringify({ i, text, locator: "txt:0" })).join(",") + COMPLETE_TAIL;

beforeEach(() => {
  files.clear();
  reads.mockClear();
});

describe("readText keeps the last document parsed", () => {
  it("reads and parses once, then serves the same sentences", async () => {
    files.set("a", stored("a", ["One.", "Two."]));
    const first = await readText("a", false);
    const again = await readText("a", false);
    expect(first?.sentences.map((s) => s.text)).toEqual(["One.", "Two."]);
    expect(again).toBe(first);
    expect(reads).toHaveBeenCalledTimes(1);
  });

  it("keeps one document: another one replaces it", async () => {
    files.set("d", stored("d", ["One."]));
    files.set("e", stored("e", ["Bee."]));
    await readText("d", false);
    await readText("e", false);
    await readText("d", false);
    expect(reads).toHaveBeenCalledTimes(3);
  });

  it("a forgotten document is read again, and a missing file isn't kept", async () => {
    files.set("c", stored("c", ["Sea."]));
    await readText("c", false);
    forgetDoc("c");
    files.delete("c");
    expect(await readText("c", false)).toBeNull();
    expect(reads).toHaveBeenCalledTimes(2);
  });
});

// V40: a locked PDF whose text job ran without its password isn't settled, so the job runs again once it's unlocked.
describe("ensureText and locked PDFs", () => {
  const posted: { sha256: string; password?: string }[] = [];
  const answers: Record<string, unknown>[] = [];
  class ScriptedWorker {
    onmessage: ((e: { data: unknown }) => void) | null = null;
    onerror: (() => void) | null = null;
    postMessage(req: { id: number; sha256: string; password?: string; type: string }) {
      if (req.type !== "extract") return;
      posted.push({ sha256: req.sha256, ...(req.password !== undefined ? { password: req.password } : {}) });
      const answer = answers.shift() ?? { ok: false };
      queueMicrotask(() => this.onmessage?.({ data: { id: req.id, ...answer } }));
    }
    terminate() {}
  }

  it("retries after a locked failure, with the password once it's kept; a plain failure settles", async () => {
    vi.stubGlobal("Worker", ScriptedWorker);
    const { ensureText } = await import("./text");
    const { pdfPasswords } = await import("./pdf-passwords");
    const doc = { sha256: "locked-1", kind: "pdf" as const };
    const file = new File(["x"], "s.pdf");

    answers.push({ ok: false, locked: true });
    await ensureText(doc, file, true);
    expect(posted).toEqual([{ sha256: "locked-1" }]);

    await pdfPasswords(true).keep("locked-1", "test", false);
    answers.push({ ok: true, status: "done", sentences: 1, json: "{}" });
    await ensureText(doc, file, true);
    expect(posted.at(-1)).toEqual({ sha256: "locked-1", password: "test" });

    // Done: settled for the session.
    await ensureText(doc, file, true);
    expect(posted).toHaveLength(2);

    // A file that breaks the extractor is settled at once (not retried until reload).
    answers.push({ ok: false });
    await ensureText({ sha256: "broken-1", kind: "pdf" }, file, true);
    await ensureText({ sha256: "broken-1", kind: "pdf" }, file, true);
    expect(posted.filter((p) => p.sha256 === "broken-1")).toHaveLength(1);
    vi.unstubAllGlobals();
  });
});
