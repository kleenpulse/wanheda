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
