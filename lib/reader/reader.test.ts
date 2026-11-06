import { describe, expect, it } from "vitest";
import { toHex } from "./device-protocol";
import {
  checkFile,
  clampAt,
  continueReading,
  documentCreateSchema,
  filterLibrary,
  formatLocator,
  isNewer,
  kindOf,
  newerProgress,
  parseLocator,
  progressWriteSchema,
  PROGRESS_SKEW_MS,
  SIZE_CAP,
  titleFromFileName,
  withProgress,
  type ReaderDoc,
  type ReaderPayload,
} from "./reader";

const DOC_ID = "5d0c3e8a-2b7f-4f6a-8e15-3c1a9b0d0001";
const SHA = "a".repeat(64);

function doc(over: Partial<ReaderDoc> = {}): ReaderDoc {
  return {
    id: DOC_ID,
    kind: "pdf",
    title: "A book",
    author: null,
    fileName: "a-book.pdf",
    sha256: SHA,
    sizeBytes: 100,
    pages: null,
    tags: [],
    mode: "scroll",
    collections: [],
    progress: null,
    lastOpenedAt: null,
    createdAt: 1,
    ...over,
  };
}

describe("files", () => {
  it("knows a kind by extension first, then by type", () => {
    expect(kindOf("notes.MD", "")).toBe("md");
    expect(kindOf("readme", "text/markdown; charset=utf-8")).toBe("md");
    expect(kindOf("paper.pdf", "application/octet-stream")).toBe("pdf");
    expect(kindOf("photo.png", "image/png")).toBeNull();
  });

  it("refuses EPUB for now, empty files and files over the cap", () => {
    expect(checkFile("a.epub", "", 10)).toEqual({ ok: false, reason: "unsupported", kind: "epub" });
    expect(checkFile("a.md", "", 0)).toMatchObject({ ok: false, reason: "empty" });
    expect(checkFile("a.md", "", SIZE_CAP.md + 1)).toMatchObject({ ok: false, reason: "too-big" });
    expect(checkFile("a.pdf", "", SIZE_CAP.pdf)).toEqual({ ok: true, kind: "pdf" });
  });

  it("makes a title from a file name", () => {
    expect(titleFromFileName("C:\\books\\the_design_of_things.pdf")).toBe("the design of things");
    expect(titleFromFileName(".pdf")).toBe("Untitled");
  });

  it("hexes a SHA-256 digest the way the worker does", async () => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("abc"));
    expect(toHex(digest)).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("locators (V41)", () => {
  it("round-trips each kind", () => {
    for (const l of [
      { kind: "pdf", page: 118, y: 200 },
      { kind: "md", heading: "opening-a-file", y: 0 },
      { kind: "md", heading: "", y: 1000 },
      { kind: "epub", cfi: "epubcfi(/6/4!/4/2)" },
    ] as const) {
      expect(parseLocator(formatLocator(l))).toEqual(l);
    }
  });

  it("clamps when formatting and refuses junk when parsing", () => {
    expect(formatLocator({ kind: "pdf", page: 0, y: 1400 })).toBe("pdf:1:1000");
    for (const bad of ["pdf:0:10", "pdf:3:1001", "md:<script>:10", "md:x", "html:1", ""]) expect(parseLocator(bad)).toBeNull();
  });

  it("only takes a well-formed locator in a progress write", () => {
    const base = { documentId: DOC_ID, percent: 10, at: 1 };
    expect(progressWriteSchema.safeParse({ ...base, locator: "pdf:2:10" }).success).toBe(true);
    expect(progressWriteSchema.safeParse({ ...base, locator: "pdf:x" }).success).toBe(false);
    expect(progressWriteSchema.safeParse({ ...base, locator: "pdf:2:10", percent: 101 }).success).toBe(false);
  });
});

describe("progress: newer wins (V41)", () => {
  const p = (at: number, percent = 10) => ({ locator: "pdf:1:0", percent, at });

  it("only a strictly newer position replaces", () => {
    expect(isNewer(p(2), null)).toBe(true);
    expect(isNewer(p(2), p(1))).toBe(true);
    expect(isNewer(p(1), p(1))).toBe(false);
    expect(isNewer(p(1), p(2))).toBe(false);
    expect(newerProgress(p(5, 50), p(3, 90))).toEqual(p(5, 50));
  });

  it("holds a client clock from the future to now plus the skew", () => {
    expect(clampAt(1_000, 1_000)).toBe(1_000);
    expect(clampAt(10 ** 13, 1_000)).toBe(1_000 + PROGRESS_SKEW_MS);
  });

  it("a stale tab can't drag the cache back", () => {
    const payload: ReaderPayload = { source: "owner", documents: [doc({ progress: p(10, 80), lastOpenedAt: 10 })], collections: [] };
    expect(withProgress(payload, DOC_ID, p(5, 20))).toBe(payload);
    const moved = withProgress(payload, DOC_ID, p(11, 81));
    expect(moved.documents[0]?.progress).toEqual(p(11, 81));
    expect(moved.documents[0]?.lastOpenedAt).toBe(11);
  });
});

describe("library", () => {
  it("filters by words in any order, tag and collection", () => {
    const docs = [
      doc({ id: "1", title: "Notes on Typography", author: "Ada", tags: ["type"], collections: ["c1"] }),
      doc({ id: "2", title: "Rivers", tags: ["travel"] }),
    ];
    expect(filterLibrary(docs, { query: "ada notes", tag: null, collection: null }).map((d) => d.id)).toEqual(["1"]);
    expect(filterLibrary(docs, { query: "", tag: "travel", collection: null }).map((d) => d.id)).toEqual(["2"]);
    expect(filterLibrary(docs, { query: "", tag: null, collection: "c1" }).map((d) => d.id)).toEqual(["1"]);
  });

  it("offers started, unfinished documents, most recent first", () => {
    const docs = [
      doc({ id: "old", lastOpenedAt: 1, progress: { locator: "pdf:1:0", percent: 20, at: 1 } }),
      doc({ id: "done", lastOpenedAt: 9, progress: { locator: "pdf:9:1000", percent: 100, at: 9 } }),
      doc({ id: "new", lastOpenedAt: 5, progress: { locator: "pdf:2:0", percent: 5, at: 5 } }),
      doc({ id: "never" }),
    ];
    expect(continueReading(docs).map((d) => d.id)).toEqual(["new", "old"]);
  });
});

describe("document create (V38, V39)", () => {
  const ok = { id: DOC_ID, kind: "md", title: "T", author: null, fileName: "t.md", sha256: SHA, sizeBytes: 10, pages: null, tags: [" Design ", "design"] };

  it("takes metadata only, and normalises tags", () => {
    const parsed = documentCreateSchema.safeParse(ok);
    expect(parsed.success && parsed.data.tags).toEqual(["design"]);
    expect(documentCreateSchema.safeParse({ ...ok, bytes: "AAAA" }).success).toBe(false);
  });

  it("refuses a malformed hash and a file over its kind's cap", () => {
    expect(documentCreateSchema.safeParse({ ...ok, sha256: SHA.toUpperCase() }).success).toBe(false);
    expect(documentCreateSchema.safeParse({ ...ok, sizeBytes: SIZE_CAP.md + 1 }).success).toBe(false);
  });
});
