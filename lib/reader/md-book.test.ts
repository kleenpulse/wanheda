import { describe, expect, it } from "vitest";
import { bookPercent, mdPageBox, pageAt, paginate, type FlowBlock, type LineBox } from "./md-book";
import { lineFor, placeAt, type Section } from "./md";

/** A paragraph of `n` 20 px lines starting at `top`. */
function para(top: number, n: number): { block: FlowBlock; lines: LineBox[] } {
  const lines = Array.from({ length: n }, (_, k) => ({ top: top + k * 20 + 3, bottom: top + k * 20 + 17 }));
  return { block: { top, bottom: top + n * 20, keep: false }, lines };
}

function flow(parts: { block: FlowBlock; lines: LineBox[] }[]) {
  return { blocks: parts.map((p) => p.block), linesOf: (i: number) => parts[i]?.lines ?? [] };
}

describe("paginate", () => {
  it("never cuts a line: a break moves up to the top of the line it would cross", () => {
    // One paragraph of 20 lines (400 px), pages 110 px tall.
    const p = para(0, 20);
    const { blocks, linesOf } = flow([p]);
    const pages = paginate(blocks, linesOf, 110, 400);
    for (const page of pages.slice(0, -1)) {
      for (const l of p.lines) expect(l.top < page.end && l.bottom > page.end).toBe(false);
      expect(page.end - page.start).toBeLessThanOrEqual(110);
    }
    // Page 2 starts at the line the first break moved up to.
    expect(pages[0]?.end).toBe(103);
    expect(pages[1]?.start).toBe(103);
    expect(pages.at(-1)?.end).toBe(400);
  });

  it("starts the next page at the next block, not in the gap between blocks", () => {
    const a = para(0, 4); // 0–80
    const b = para(100, 4); // 100–180
    const { blocks, linesOf } = flow([a, b]);
    const pages = paginate(blocks, linesOf, 90, 180);
    expect(pages[0]).toEqual({ start: 0, end: 90 });
    expect(pages[1]?.start).toBe(100);
  });

  it("moves a heading at the foot of a page over to the next, with its text", () => {
    const intro = para(0, 4); // 0–80
    const heading = { block: { top: 90, bottom: 120, keep: true }, lines: [{ top: 92, bottom: 118 }] };
    const body = para(130, 6); // 130–250
    const { blocks, linesOf } = flow([intro, heading, body]);
    // The limit (140) falls in the body's first line: that line moves over, and the heading with it.
    const pages = paginate(blocks, linesOf, 140, 250);
    expect(pages[0]?.end).toBe(90);
    expect(pages[1]?.start).toBe(90);
  });

  it("moves a heading the limit falls in, whole", () => {
    const intro = para(0, 4);
    const heading = { block: { top: 90, bottom: 130, keep: true }, lines: [{ top: 92, bottom: 128 }] };
    const body = para(140, 4);
    const { blocks, linesOf } = flow([intro, heading, body]);
    const pages = paginate(blocks, linesOf, 100, 220);
    expect(pages[0]?.end).toBe(90);
    expect(pages[1]?.start).toBe(90);
  });

  it("cuts through something taller than a page instead of making an empty one", () => {
    const image = { block: { top: 0, bottom: 500, keep: false }, lines: [{ top: 0, bottom: 500 }] };
    const { blocks, linesOf } = flow([image]);
    const pages = paginate(blocks, linesOf, 200, 500);
    expect(pages.map((p) => p.start)).toEqual([0, 200, 400]);
  });

  it("reads one tall block's lines once, however many pages it spans (Reviewer FIX)", () => {
    // A text file with no blank lines: one paragraph of 20,000 lines.
    const p = para(0, 20_000);
    let reads = 0;
    const pages = paginate(
      [p.block],
      () => {
        reads++;
        return p.lines;
      },
      450,
      p.block.bottom,
    );
    expect(reads).toBe(1);
    expect(pages.length).toBeGreaterThan(800);
    for (const page of pages.slice(0, -1)) expect(p.lines.some((l) => l.top < page.end && l.bottom > page.end)).toBe(false);
  });

  it("gives an empty document one page", () => {
    expect(paginate([], () => [], 300, 0)).toEqual([{ start: 0, end: 0 }]);
  });

  it("asks only for the lines of blocks a break falls in", () => {
    const parts = Array.from({ length: 200 }, (_, k) => para(k * 100, 4));
    const asked = new Set<number>();
    const pages = paginate(
      parts.map((p) => p.block),
      (i) => {
        asked.add(i);
        return parts[i]?.lines ?? [];
      },
      250,
      20_000,
    );
    expect(pages.length).toBeGreaterThan(50);
    expect(asked.size).toBeLessThanOrEqual(pages.length);
  });
});

describe("the place across scroll and book (V41, V42)", () => {
  const sections: Section[] = [
    { anchor: "one", top: 0 },
    { anchor: "two", top: 1000 },
    { anchor: "three", top: 2600 },
  ];
  const total = 4000;
  const parts = Array.from({ length: 40 }, (_, k) => para(k * 100, 4));
  const { blocks, linesOf } = flow(parts);
  const pages = paginate(blocks, linesOf, 450, total);

  it("puts a place on the page that holds it", () => {
    const place = { heading: "two", y: 500 }; // 1800
    const y = lineFor(sections, place, total) ?? 0;
    const page = pageAt(pages, y);
    const span = pages[page - 1];
    expect(span && span.start <= y && (pages[page]?.start ?? Infinity) > y).toBe(true);
  });

  it("turning to a page reads back as a place in the same section, on the same page", () => {
    for (let page = 1; page <= pages.length; page++) {
      const start = pages[page - 1]?.start ?? 0;
      const place = placeAt(sections, start, total);
      expect(pageAt(pages, lineFor(sections, place, total) ?? -1)).toBe(page);
    }
  });

  it("finds the page for any y, before the first and past the last", () => {
    expect(pageAt(pages, -10)).toBe(1);
    expect(pageAt(pages, 1e9)).toBe(pages.length);
  });
});

describe("bookPercent", () => {
  const pages = [
    { start: 0, end: 100 },
    { start: 100, end: 200 },
    { start: 200, end: 300 },
    { start: 300, end: 350 },
  ];
  it("counts from where the open pages start", () => {
    expect(bookPercent([1], pages, 350)).toBe(0);
    expect(bookPercent([2, 3], pages, 350)).toBe(29);
  });
  it("is 100 once the last page shows", () => {
    expect(bookPercent([4], pages, 350)).toBe(100);
  });
});

describe("mdPageBox", () => {
  it("fits half the room for a spread, within a book's shape", () => {
    const box = mdPageBox(1000, 700, false);
    expect(box?.width).toBeCloseTo(500 / (1.4 / 1.4), 5);
    expect(box?.height).toBe(700);
  });
  it("keeps a wide, short room from making a squat page", () => {
    const box = mdPageBox(1600, 500, false);
    expect(box && box.height / box.width).toBeCloseTo(1.25, 5);
    expect(box?.height).toBe(500);
  });
  it("lets an upright phone's single page stand taller", () => {
    const box = mdPageBox(300, 700, true);
    expect(box?.width).toBe(300);
    expect(box && box.height / box.width).toBeCloseTo(2.1, 5);
  });
  it("is null before the room is measured", () => {
    expect(mdPageBox(0, 500, false)).toBeNull();
  });
});
