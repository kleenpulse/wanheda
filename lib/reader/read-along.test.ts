import { describe, expect, it } from "vitest";
import { extractMarkdown, extractPdf, type PdfSource, type Sentence } from "./extract";
import { anchorOf, placeAt, type Section } from "./md";
import { mdTree } from "./md-pipeline";
import {
  NormBuilder,
  continuedHit,
  directionOf,
  firstMdEstimate,
  firstPdfSentence,
  holdsPlace,
  mdAt,
  mdOrder,
  mdVoiceLocator,
  nearest,
  pageDirection,
  pageText,
  pdfAt,
  sentenceHits,
  spanPieces,
} from "./read-along";
import { formatLocator } from "./reader";

const live = () => new AbortController().signal;

interface FakeRun {
  str: string;
  hasEOL: boolean;
  /** Top of the run, ‰ of the page. */
  y: number;
}

/** A PDF of text runs, for extractPdf (y is flipped the way PDF space is: 0 at the bottom). */
function fakePdf(pages: FakeRun[][]): PdfSource {
  return {
    numPages: pages.length,
    getPage: (n) =>
      Promise.resolve({
        getViewport: () => ({ width: 1000, height: 1000, convertToViewportPoint: (x: number, y: number) => [x, 1000 - y] }),
        getTextContent: () =>
          Promise.resolve({ items: (pages[n - 1] ?? []).map((r) => ({ str: r.str, hasEOL: r.hasEOL, transform: [1, 0, 0, 1, 0, 1000 - r.y - 10], height: 10 })) }),
        cleanup: () => undefined,
      }),
  };
}

async function pdfSentences(pages: FakeRun[][]): Promise<Sentence[]> {
  const out: Sentence[] = [];
  await extractPdf(fakePdf(pages), (s) => out.push(s), live());
  return out;
}

const PAGES: FakeRun[][] = [
  [
    { str: "Chapter  One", hasEOL: true, y: 50 },
    { str: "Yes. The rain ", hasEOL: false, y: 100 },
    { str: "fell all\u0001 night.", hasEOL: true, y: 100 },
    { str: "Yes. It kept falling and", hasEOL: true, y: 600 },
    { str: "it did not", hasEOL: true, y: 900 },
  ],
  [
    { str: "stop until dawn. Then quiet.", hasEOL: true, y: 40 },
  ],
];

/** Finds a sentence on its own page the way the PDF reader does: nearest its locator's y, then any run-on onto the next page. */
function findOnPdf(pages: FakeRun[][], s: Sentence) {
  const at = pdfAt(s.locator);
  if (!at) return null;
  const runs = pages[at.page - 1] ?? [];
  const norm = pageText(runs);
  const hit = nearest(sentenceHits(norm.text, s.text, true), (h) => Math.abs((runs[norm.piece[h.start] ?? 0]?.y ?? 0) - at.y));
  if (!hit) return null;
  const shown = spanPieces(norm, hit.start, hit.end).map((p) => runs[p.piece]?.str.slice(p.from, p.to));
  let next: (string | undefined)[] = [];
  if (hit.rest) {
    const runs2 = pages[at.page] ?? [];
    const norm2 = pageText(runs2);
    const h2 = continuedHit(norm2.text, hit.rest);
    if (h2) next = spanPieces(norm2, h2.start, h2.end).map((p) => runs2[p.piece]?.str.slice(p.from, p.to));
  }
  return { shown, next };
}

describe("pdf: a sentence found again on its page", () => {
  it("joins runs exactly as the extractor did", async () => {
    const sentences = await pdfSentences(PAGES);
    expect(sentences.map((s) => s.text)).toEqual([
      "Chapter One Yes.",
      "The rain fell all night.",
      "Yes.",
      "It kept falling and it did not stop until dawn.",
      "Then quiet.",
    ]);
    for (const s of sentences) expect(findOnPdf(PAGES, s), s.text).not.toBeNull();
  });

  it("maps a sentence back to the parts of the runs that show it", async () => {
    const sentences = await pdfSentences(PAGES);
    expect(findOnPdf(PAGES, sentences[1] as Sentence)?.shown).toEqual(["The rain", "fell all\u0001 night."]);
  });

  it("tells a repeated sentence apart by its locator's y", async () => {
    const sentences = await pdfSentences(PAGES);
    const yes = sentences[2] as Sentence;
    expect(pdfAt(yes.locator)).toEqual({ page: 1, y: 600 });
    expect(findOnPdf(PAGES, yes)?.shown).toEqual(["Yes."]);
    const runs = PAGES[0] ?? [];
    const norm = pageText(runs);
    const hits = sentenceHits(norm.text, "Yes.", true);
    expect(hits).toHaveLength(2);
    const near = nearest(hits, (h) => Math.abs((runs[norm.piece[h.start] ?? 0]?.y ?? 0) - 600));
    expect(norm.piece[near?.start ?? 0]).toBe(3);
  });

  it("follows a sentence over a page break", async () => {
    const sentences = await pdfSentences(PAGES);
    const found = findOnPdf(PAGES, sentences[3] as Sentence);
    expect(found?.shown).toEqual(["It kept falling and", "it did not"]);
    expect(found?.next).toEqual(["stop until dawn."]);
  });

  it("finds a run-on sentence whose part on the page is shorter than the probe", () => {
    const norm = pageText([{ str: "End. A", hasEOL: true }]);
    const [hit] = sentenceHits(norm.text, "A long sentence that carries on across the page and well past forty-eight characters.", true);
    expect(hit).toMatchObject({ start: 5, end: 6 });
    expect(hit?.rest.startsWith("long sentence")).toBe(true);
  });

  it("reports extraction progress page by page without changing what comes out", async () => {
    const calls: [number, number][] = [];
    const out: Sentence[] = [];
    await extractPdf(fakePdf(PAGES), (s) => out.push(s), live(), (done, total) => calls.push([done, total]));
    expect(calls).toEqual([
      [0, 2],
      [1, 2],
    ]);
    expect(out).toEqual(await pdfSentences(PAGES));
  });

  it("starts play at the first sentence at or after the shown place", async () => {
    const sentences = await pdfSentences(PAGES);
    expect(firstPdfSentence(sentences, { page: 1, y: 0 })).toBe(0);
    expect(firstPdfSentence(sentences, { page: 1, y: 300 })).toBe(2);
    expect(firstPdfSentence(sentences, { page: 2, y: 0 })).toBe(4);
    expect(firstPdfSentence(sentences, { page: 9, y: 0 })).toBe(4);
    expect(firstPdfSentence([], { page: 1, y: 0 })).toBe(0);
  });
});

describe("NormBuilder", () => {
  it("collapses whitespace, drops control characters and breaks blocks with a newline", () => {
    const b = new NormBuilder();
    b.add(0, "  Hello,\t\n ");
    b.add(1, " world.\u0007");
    b.brk();
    b.add(2, "Next");
    b.brk();
    b.brk();
    const n = b.done();
    expect(n.text).toBe("Hello, world.\nNext\n");
    expect(spanPieces(n, 0, 13)).toEqual([
      { piece: 0, from: 2, to: 8 },
      { piece: 1, from: 1, to: 7 },
    ]);
  });
});

describe("markdown: the voice's place", () => {
  // One long line a paragraph: the extractor guesses 70 characters a line; the reader below wraps at 30.
  const para = (n: number) =>
    `Paragraph ${String(n)} opens here and runs on for a good long while. It has a second sentence, number ${String(n)}, that is also long enough to wrap. A third one closes ${String(n)}.`;
  const fixture = ["# Start", "", para(1), "", para(2), "", "## Middle", "", para(3), "", para(4), "", para(5)].join("\n");

  /** The reader's layout, simulated: blocks of 30-character lines, a blank line between blocks, headings one line. */
  function layout(md: string) {
    const tree = mdTree(md);
    const blocks: { text: string; top: number; heading: string | null }[] = [];
    let top = 0;
    for (const n of tree.children) {
      if (n.type !== "element") continue;
      const text = n.children.map((c) => (c.type === "text" ? c.value : "")).join("");
      const heading = /^h[1-6]$/.test(n.tagName) && typeof n.properties.id === "string" ? anchorOf(n.properties.id) : null;
      blocks.push({ text, top, heading });
      top += (heading !== null ? 1 : Math.ceil(text.length / 30)) + 1;
    }
    const sections: Section[] = blocks.flatMap((b) => (b.heading !== null ? [{ anchor: b.heading, top: b.top }] : []));
    return { blocks, sections, end: top };
  }

  it("saves the reader's placeAt for the line the sentence starts on, not the text.json estimate", () => {
    const sentences: Sentence[] = [];
    extractMarkdown(mdTree(fixture), (s) => sentences.push(s), live());
    const { blocks, sections, end } = layout(fixture);
    // The whole text normalised, one piece a block, as the reader indexes its DOM.
    const b = new NormBuilder();
    blocks.forEach((blk, i) => {
      b.add(i, blk.text);
      b.brk();
    });
    const norm = b.done();
    let checked = 0;
    for (const k of [2, 5, 9, 13]) {
      const s = sentences[k] as Sentence;
      const [hit] = sentenceHits(norm.text, s.text, false);
      expect(hit, s.text).toBeDefined();
      const block = blocks[norm.piece[hit?.start ?? 0] ?? 0];
      const line = (block?.top ?? 0) + Math.floor((norm.off[hit?.start ?? 0] ?? 0) / 30);
      const saved = mdVoiceLocator(sections, line, end);
      const p = placeAt(sections, line, end);
      expect(saved).toBe(formatLocator({ kind: "md", heading: p.heading, y: p.y }));
      expect(saved).not.toBe(s.locator);
      // Same section either way: only how far into it differs.
      expect(mdAt(saved)?.heading).toBe(mdAt(s.locator)?.heading);
      checked++;
    }
    expect(checked).toBe(4);
  });

  it("estimates the first sentence at or after a place in document order", () => {
    const sentences: Sentence[] = [];
    extractMarkdown(mdTree(fixture), (s) => sentences.push(s), live());
    const order = mdOrder(["start", "middle"]);
    expect(firstMdEstimate(sentences, order, { heading: "", y: 0 })).toBe(0);
    const middle = firstMdEstimate(sentences, order, { heading: "middle", y: 0 });
    expect(mdAt(sentences[middle]?.locator ?? "")?.heading).toBe("middle");
    expect(mdAt(sentences[middle - 1]?.locator ?? "")?.heading).toBe("start");
    expect(firstMdEstimate(sentences, order, { heading: "middle", y: 1000 })).toBe(sentences.length - 1);
    expect(order({ heading: "gone", y: 3 })).toBeNull();
  });
});

describe("holdsPlace", () => {
  it("holds only while speaking and followed", () => {
    expect(holdsPlace("playing", true)).toBe(true);
    expect(holdsPlace("paused", true)).toBe(false);
    expect(holdsPlace("playing", false)).toBe(false);
    expect(holdsPlace("idle", true)).toBe(false);
  });
});

describe("direction", () => {
  it("points at the sentence from the view", () => {
    expect(directionOf(0, 10, 50, 500)).toBe("up");
    expect(directionOf(40, 60, 50, 500)).toBeNull();
    expect(directionOf(500, 520, 50, 500)).toBe("down");
    expect(pageDirection(3, [4, 5])).toBe("left");
    expect(pageDirection(5, [4, 5])).toBeNull();
    expect(pageDirection(9, [4, 5])).toBe("right");
  });
});
