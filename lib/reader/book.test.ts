import { describe, expect, it } from "vitest";
import {
  PHANTOM,
  bookWindow,
  highlightRun,
  queryPattern,
  needsRebuild,
  nextZoom,
  pageFieldText,
  pagesToRender,
  parsePageField,
  pdfPercent,
  renderScale,
  spreadAtIndex,
  spreadCount,
  spreadOf,
  spreadPages,
  spreadPercent,
  windowIndex,
  MAX_PAGE_PIXELS,
  autoScrollSpeed,
  cleanPageField,
} from "./book";

const wide = (pages: number) => ({ pages, single: false });
const single = (pages: number) => ({ pages, single: true });

describe("spreads (V42)", () => {
  it("opens page 1 alone as the cover, then pairs", () => {
    const l = wide(9);
    expect(spreadCount(l)).toBe(5);
    expect([0, 1, 2, 3, 4].map((s) => spreadPages(s, l))).toEqual([[1], [2, 3], [4, 5], [6, 7], [8, 9]]);
    expect([1, 2, 3, 4, 5, 9].map((p) => spreadOf(p, l))).toEqual([0, 1, 1, 2, 2, 4]);
  });

  it("leaves a trailing even page alone", () => {
    const l = wide(8);
    expect(spreadCount(l)).toBe(5);
    expect(spreadPages(4, l)).toEqual([8]);
    expect(spreadOf(8, l)).toBe(4);
  });

  it("is one page a spread on a narrow screen", () => {
    expect(spreadCount(single(3))).toBe(3);
    expect(spreadPages(2, single(3))).toEqual([3]);
    expect(spreadOf(3, single(3))).toBe(2);
  });

  it("clamps pages and spreads out of range", () => {
    expect(spreadOf(99, wide(9))).toBe(4);
    expect(spreadOf(0, wide(9))).toBe(0);
    expect(spreadPages(-3, wide(9))).toEqual([1]);
  });
});

describe("the page-flip window", () => {
  it("pairs from an even index with phantoms, so page-flip's pairing is the book's", () => {
    const l = wide(9);
    const w = bookWindow(0, l);
    expect(w.items).toEqual([PHANTOM, 1, 2, 3, 4, 5]);
    expect(windowIndex(w, 1)).toBe(1);
    expect(w.items.length % 2).toBe(0);

    const mid = bookWindow(3, l);
    expect(mid).toEqual({ from: 1, to: 4, items: [2, 3, 4, 5, 6, 7, 8, 9] });
    expect(mid.items.length % 2).toBe(0);
  });

  it("pads a lone last page with a phantom", () => {
    expect(bookWindow(4, wide(8)).items).toEqual([4, 5, 6, 7, 8, PHANTOM]);
  });

  it("holds a few pages even for a 14,000-page book", () => {
    const l = wide(14_038);
    const w = bookWindow(spreadOf(7_000, l), l);
    expect(w.items.length).toBeLessThanOrEqual(10);
    expect(w.items).toContain(7_000);
    expect((w.items[0] ?? 1) % 2).toBe(0);
  });

  it("maps an index back to its spread, phantoms included", () => {
    const l = wide(8);
    const w = bookWindow(0, l);
    expect(spreadAtIndex(w, 0, l)).toBe(0);
    expect(spreadAtIndex(w, 1, l)).toBe(0);
    expect(spreadAtIndex(w, 2, l)).toBe(1);
    const end = bookWindow(4, l);
    expect(spreadAtIndex(end, end.items.length - 1, l)).toBe(4);
  });

  it("rebuilds at an edge with more book beyond, never at the book's own ends", () => {
    const l = wide(100);
    const w = bookWindow(10, l);
    expect(needsRebuild(w, 10, l)).toBe(false);
    expect(needsRebuild(w, 11, l)).toBe(false);
    expect(needsRebuild(w, 12, l)).toBe(true);
    expect(needsRebuild(w, 8, l)).toBe(true);
    expect(needsRebuild(w, 40, l)).toBe(true);
    expect(needsRebuild(bookWindow(0, l), 0, l)).toBe(false);
    const last = spreadCount(l) - 1;
    expect(needsRebuild(bookWindow(last, l), last, l)).toBe(false);
  });

  it("renders only the open spread and one either side (V43)", () => {
    expect(pagesToRender(2, wide(9))).toEqual([2, 3, 4, 5, 6, 7]);
    expect(pagesToRender(0, wide(9))).toEqual([1, 2, 3]);
    expect(pagesToRender(0, single(9))).toEqual([1, 2]);
  });
});

describe("page field", () => {
  it("shows the open pages", () => {
    expect(pageFieldText(0, wide(9))).toBe("1");
    expect(pageFieldText(2, wide(9))).toBe("4-5");
    expect(pageFieldText(4, wide(8))).toBe("8");
    expect(pageFieldText(4, single(8))).toBe("5");
  });

  it("lets only digits and one hyphen in as it's typed", () => {
    expect(cleanPageField("142-hvc")).toBe("142-");
    expect(cleanPageField("12a3")).toBe("123");
    expect(cleanPageField("-5")).toBe("5");
    expect(cleanPageField("4-5-6")).toBe("4-56");
    expect(cleanPageField(" 7 / 300")).toBe("7");
    expect(cleanPageField("12-13 / 300")).toBe("12-13");
    expect(cleanPageField("abc")).toBe("");
  });

  it("reads what was typed, clamped to the book", () => {
    expect(parsePageField("12", 300)).toBe(12);
    expect(parsePageField(" 12-13 ", 300)).toBe(12);
    expect(parsePageField("142-", 300)).toBe(142);
    expect(parsePageField("12 / 300", 300)).toBe(12);
    expect(parsePageField("900", 300)).toBe(300);
    expect(parsePageField("0", 300)).toBe(1);
    expect(parsePageField("abc", 300)).toBeNull();
    expect(parsePageField("", 300)).toBeNull();
    expect(parsePageField("3", 0)).toBeNull();
  });
});

describe("percent (V41)", () => {
  it("counts pages and the part of the page read", () => {
    expect(pdfPercent(1, 0, 300)).toBe(0);
    expect(pdfPercent(151, 0, 300)).toBe(50);
    expect(pdfPercent(300, 1000, 300)).toBe(100);
    expect(pdfPercent(5, 0, 0)).toBe(0);
  });

  it("is 100 once the last page shows in the book", () => {
    expect(spreadPercent(4, wide(9))).toBe(100);
    expect(spreadPercent(0, wide(9))).toBe(0);
  });
});

describe("rendering", () => {
  it("renders sharp for the screen, under the pixel cap", () => {
    expect(renderScale(612, 792, 612, 2)).toBeCloseTo(2);
    const s = renderScale(612, 792, 5000, 3);
    expect(612 * s * 792 * s).toBeLessThanOrEqual(MAX_PAGE_PIXELS + 1);
  });

  it("steps zoom through its stops", () => {
    expect(nextZoom(1, 1)).toBe(1.25);
    expect(nextZoom(3, 1)).toBe(3);
    expect(nextZoom(1, -1)).toBe(1);
    expect(nextZoom(1.6, 1)).toBe(2);
    expect(nextZoom(1.6, -1)).toBe(1.5);
  });
});

describe("auto-scroll speed", () => {
  it("creeps at the low end and climbs on a curve", () => {
    expect(autoScrollSpeed(20)).toBeCloseTo(8);
    expect(autoScrollSpeed(50)).toBe(50);
    expect(autoScrollSpeed(100)).toBe(200);
    expect(autoScrollSpeed(0)).toBe(1);
    expect(autoScrollSpeed(500)).toBe(200);
    expect(autoScrollSpeed(Number.NaN)).toBe(1);
  });
});

describe("find highlighting (V40)", () => {
  it("marks every match, case-insensitive", () => {
    expect(highlightRun("Shadow and shadow", "shadow")).toBe("<mark>Shadow</mark> and <mark>shadow</mark>");
  });

  it("escapes the PDF's text so it can't become markup", () => {
    expect(highlightRun('<img src=x onerror="a()">', "img")).toBe("&lt;<mark>img</mark> src=x onerror=&quot;a()&quot;&gt;");
    // A query that is itself an entity name doesn't match inside an escape.
    expect(highlightRun("a & b", "amp")).toBe("a &amp; b");
    expect(highlightRun("<b>", "")).toBe("&lt;b&gt;");
  });

  it("keeps marks on the right letters where lower-casing changes length", () => {
    // "İ".toLowerCase() is two code units: offsets from a lower-cased copy would shift the mark.
    expect(highlightRun("İstanbul shadow", "shadow")).toBe("İstanbul <mark>shadow</mark>");
  });

  it("treats the query as text, not a pattern, and spans any whitespace", () => {
    expect(highlightRun("a.b (c) a+b", "a+b")).toBe("a.b (c) <mark>a+b</mark>");
    expect(queryPattern("shadow garden")?.test("Shadow\u00a0 garden")).toBe(true);
    expect(queryPattern("")).toBeNull();
  });
});
