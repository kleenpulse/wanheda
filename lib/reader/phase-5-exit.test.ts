import { describe, expect, it } from "vitest";
import { spreadOf, spreadPages, turnFor, type BookLayout } from "./book";
import { lineFor, placeAt, type Section } from "./md";
import { pageAt, type PageSpan } from "./md-book";
import {
  NO_PLACE_AT,
  clampAt,
  formatLocator,
  isNewer,
  moveAt,
  openWrite,
  parseLocator,
  placeFromElsewhere,
  withProgress,
  type Progress,
  type ProgressWrite,
  type ReaderDoc,
  type ReaderPayload,
} from "./reader";

// Phase 5 exit (T51), the parts that are logic: close on the desktop → open
// on the phone ⇒ same page (V41, V42), and the book's keys (V42). The cold
// open and smooth scroll (V43) and the swipe and reduced motion are measured
// in the browser (hand-off 2026-11-06-phase-5-exit.md).

const DOC_ID = "5d0c3e8a-2b7f-4f6a-8e15-3c1a9b0d0001";
const T0 = Date.UTC(2026, 10, 6, 9);

function doc(progress: Progress | null): ReaderDoc {
  return {
    id: DOC_ID,
    kind: "pdf",
    title: "Book",
    author: null,
    fileName: "book.pdf",
    sha256: "c".repeat(64),
    sizeBytes: 1,
    pages: 300,
    tags: [],
    mode: "flip",
    collections: [],
    progress,
    lastOpenedAt: progress?.at ?? null,
    createdAt: 1,
  };
}

/** The server's rule (store.ts saveProgress): a strictly newer clock wins; otherwise the write is answered `stale` with the row. */
function server() {
  let row: Progress | null = null;
  return {
    save(w: ProgressWrite, now: number): { kind: "saved" | "stale"; progress: Progress } {
      const next = { locator: w.locator, percent: w.percent, at: clampAt(w.at, now) };
      if (isNewer(next, row)) {
        row = next;
        return { kind: "saved", progress: next };
      }
      return { kind: "stale", progress: row ?? next };
    },
    get row() {
      return row;
    },
  };
}

const desktop: BookLayout = { pages: 300, single: false };
const phone: BookLayout = { pages: 300, single: true };

/** The page a PDF locator opens on in a layout: the spread holding it, its pages. */
function opensOn(locator: string, layout: BookLayout): number[] {
  const l = parseLocator(locator);
  if (l?.kind !== "pdf") throw new Error(locator);
  return spreadPages(spreadOf(l.page, layout), layout);
}

describe("close on the desktop → open on the phone ⇒ same page (V41)", () => {
  it("a spread's place opens on that page alone on the phone, and back", () => {
    // The desktop turns to the spread 48-49: the reader saves its first page (pdf-reader onSpread).
    const saved = formatLocator({ kind: "pdf", page: spreadPages(spreadOf(49, desktop), desktop)[0] ?? 1, y: 0 });
    expect(saved).toBe("pdf:48:0");
    expect(opensOn(saved, phone)).toEqual([48]);
    // The phone reads on to 49 alone; the desktop opens the spread holding it.
    expect(opensOn("pdf:49:0", desktop)).toEqual([48, 49]);
    // A place partway down a page (the scroll view) keeps its page in the book.
    expect(opensOn("pdf:137:640", phone)).toEqual([137]);
    expect(opensOn("pdf:137:640", desktop)).toEqual([136, 137]);
  });

  it("a phone opening from its stale copy of the library lands on the desktop's page, and never overwrites it", () => {
    const s = server();
    // Yesterday the phone read to page 10; its device snapshot still says so.
    s.save({ documentId: DOC_ID, locator: "pdf:10:0", percent: 3, at: T0 }, T0);
    const snapshot: ReaderPayload = { source: "owner", documents: [doc(s.row)], collections: [] };
    // Today the desktop reads to page 48, closes (beacon).
    const desk = T0 + 3_600_000;
    expect(s.save({ documentId: DOC_ID, locator: "pdf:48:0", percent: 16, at: desk }, desk).kind).toBe("saved");

    // The phone wakes on the document and paints from the snapshot (V24): page 10, and sends its open.
    const now = desk + 60_000;
    const opened = snapshot.documents[0]?.progress ?? null;
    const open = openWrite(DOC_ID, "pdf:10:0", 3, opened, now);
    expect(open.at).toBe(T0);
    const reply = s.save(open, now);
    // The desktop's page stands on the server; the answer carries it.
    expect(reply).toEqual({ kind: "stale", progress: { locator: "pdf:48:0", percent: 16, at: desk } });
    expect(s.row?.locator).toBe("pdf:48:0");

    // The answer folds into the library; the open reader sees a place saved after its own and goes there.
    const library = withProgress(snapshot, DOC_ID, reply.progress);
    const next = placeFromElsewhere(library.documents[0]?.progress ?? null, opened?.at ?? NO_PLACE_AT);
    expect(next?.locator).toBe("pdf:48:0");
    expect(opensOn(next?.locator ?? "", phone)).toEqual([48]);
  });

  it("the phone's next turn wins even with its clock a little behind the desktop's", () => {
    const s = server();
    const desk = T0;
    s.save({ documentId: DOC_ID, locator: "pdf:48:0", percent: 16, at: desk }, desk);
    // The phone shows the desktop's place (shown at = desk) and turns to 49 with a clock 3 s slow.
    const phoneClock = desk - 3_000;
    const at = moveAt(phoneClock, desk);
    expect(at).toBe(desk + 1);
    expect(s.save({ documentId: DOC_ID, locator: "pdf:49:0", percent: 16, at }, desk + 20_000).kind).toBe("saved");
    expect(s.row?.locator).toBe("pdf:49:0");
  });

  it("an open bumps last opened without moving the place", () => {
    const placed = doc({ locator: "pdf:48:0", percent: 16, at: T0 });
    const payload: ReaderPayload = { source: "owner", documents: [placed], collections: [] };
    const after = withProgress(payload, DOC_ID, { locator: "pdf:48:0", percent: 16, at: T0 }, T0 + 5_000);
    expect(after.documents[0]?.progress).toEqual(placed.progress);
    expect(after.documents[0]?.lastOpenedAt).toBe(T0 + 5_000);
    // A place never read anywhere opens under the oldest clock: any real place beats it.
    const fresh = openWrite(DOC_ID, "pdf:1:0", 0, null, T0);
    expect(fresh.at).toBe(NO_PLACE_AT);
    expect(isNewer({ at: T0 - 1 }, { at: fresh.at })).toBe(true);
  });

  it("a Markdown place read in the desktop's scroll opens on the phone's book page holding it", () => {
    // Desktop: wide text, sections at 0, 1000, 2600 px, the reading line at 1800 (halfway through B).
    const wide: Section[] = [
      { anchor: "a", top: 0 },
      { anchor: "b", top: 1000 },
      { anchor: "c", top: 2600 },
    ];
    const place = placeAt(wide, 1800, 4000);
    expect(place).toEqual({ heading: "b", y: 500 });
    const locator = formatLocator({ kind: "md", heading: place.heading, y: place.y });
    // Phone: narrow text runs taller; the book's pages are 600 px of it.
    const narrow: Section[] = [
      { anchor: "a", top: 0 },
      { anchor: "b", top: 1700 },
      { anchor: "c", top: 4300 },
    ];
    const l = parseLocator(locator);
    if (l?.kind !== "md") throw new Error(locator);
    const line = lineFor(narrow, l, 6500);
    expect(line).toBe(3000);
    const pages: PageSpan[] = Array.from({ length: 11 }, (_, k) => ({ start: k * 600, end: (k + 1) * 600 }));
    // Same part of the same section: page 6 starts at 3000.
    expect(pageAt(pages, line ?? 0)).toBe(6);
  });
});

describe("flip with keys (V42)", () => {
  it("turns on arrows, Page keys and Space in the book; Home and End go to the ends", () => {
    expect(turnFor("ArrowRight", false, true)).toBe("next");
    expect(turnFor("ArrowLeft", false, true)).toBe("prev");
    expect(turnFor("PageDown", false, true)).toBe("next");
    expect(turnFor("PageUp", false, true)).toBe("prev");
    expect(turnFor(" ", false, true)).toBe("next");
    expect(turnFor(" ", true, true)).toBe("prev");
    expect(turnFor("Home", false, true)).toBe("first");
    expect(turnFor("End", false, true)).toBe("last");
    expect(turnFor("a", false, true)).toBeNull();
  });

  it("leaves Space, Page keys, Home and End to the scroll", () => {
    expect(turnFor("ArrowRight", false, false)).toBe("next");
    expect(turnFor("ArrowLeft", false, false)).toBe("prev");
    for (const key of [" ", "PageDown", "PageUp", "Home", "End"]) expect(turnFor(key, false, false)).toBeNull();
  });
});
