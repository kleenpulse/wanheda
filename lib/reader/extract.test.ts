import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { describe, expect, it } from "vitest";
import {
  COMPLETE_TAIL,
  EXTRACTOR_VERSION,
  MAX_SENTENCE,
  SentenceStream,
  extractMarkdown,
  extractPdf,
  extractText,
  isCurrent,
  parseTextFile,
  segment,
  textFileHead,
  type Sentence,
} from "./extract";
import { anchorOf } from "./md";
import { MD_REHYPE, MD_REMARK, MD_REMARK_REHYPE, mdTree } from "./md-pipeline";
import { parseLocator } from "./reader";

const live = () => new AbortController().signal;

function collect(run: (emit: (s: Sentence) => void) => void | Promise<void>): Promise<Sentence[]> {
  const out: Sentence[] = [];
  return Promise.resolve(run((s) => out.push(s))).then(() => out);
}

describe("segment", () => {
  it("splits sentences, trims them and leaves out empty ones", () => {
    const text = "  One here. Two there!  Three?  ";
    expect(segment(text).map(([a, b]) => text.slice(a, b))).toEqual(["One here.", "Two there!", "Three?"]);
  });

  it("splits CJK without spaces", () => {
    const text = "今日は晴れです。明日は雨です。";
    expect(segment(text).map(([a, b]) => text.slice(a, b))).toEqual(["今日は晴れです。", "明日は雨です。"]);
  });

  it("cuts a run with no sentence end at a space, never over the limit", () => {
    const text = Array.from({ length: 600 }, () => "word").join(" ");
    const parts = segment(text);
    expect(parts.length).toBeGreaterThan(1);
    for (const [a, b] of parts) {
      expect(b - a).toBeLessThanOrEqual(MAX_SENTENCE);
      expect(text.slice(a, b)).toMatch(/^word( word)*$/);
    }
    expect(parts.map(([a, b]) => text.slice(a, b)).join(" ")).toBe(text);
  });

  it("hard-cuts a run with no spaces outside a surrogate pair", () => {
    const text = "😀".repeat(MAX_SENTENCE);
    for (const [a, b] of segment(text)) {
      expect(b - a).toBeLessThanOrEqual(MAX_SENTENCE);
      expect(text.slice(a, b)).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
    }
  });
});

describe("SentenceStream", () => {
  it("keeps a sentence that runs over a page break whole, at the place it started", async () => {
    const out = await collect((emit) => {
      const s = new SentenceStream(emit);
      s.push("First one. A second", "pdf:1:900");
      s.space();
      s.flush();
      s.push("sentence ends here. Third.", "pdf:2:50");
      s.space();
      s.flush(true);
    });
    expect(out).toEqual([
      { i: 0, text: "First one.", locator: "pdf:1:900" },
      { i: 1, text: "A second sentence ends here.", locator: "pdf:1:900" },
      { i: 2, text: "Third.", locator: "pdf:2:50" },
    ]);
  });

  it("places a sentence at the piece it starts in, not the one before", async () => {
    const out = await collect((emit) => {
      const s = new SentenceStream(emit);
      s.push("Line one ends.", "pdf:3:100");
      s.space();
      s.push("Line two starts.", "pdf:3:140");
      s.flush(true);
    });
    expect(out.map((x) => x.locator)).toEqual(["pdf:3:100", "pdf:3:140"]);
  });

  it("emits text with no sentence end in bounded pieces as it goes, not all at the end", () => {
    const out: Sentence[] = [];
    const s = new SentenceStream((x) => out.push(x));
    for (let p = 1; p <= 50; p++) {
      s.push("Words without an end ".repeat(40), `pdf:${String(p)}:0`);
      s.flush();
      // Each page adds 840 characters; never more than one limit's worth waits.
      expect(p * 840 - out.reduce((n, x) => n + x.text.length + 1, 0)).toBeLessThanOrEqual(MAX_SENTENCE + 840);
    }
    s.flush(true);
    for (const x of out) expect(x.text.length).toBeLessThanOrEqual(MAX_SENTENCE);
  });
});

// ── PDF, through real pdf.js ─────────────────────────────────────────────

/** A small PDF: each page a list of [text, baseline y] in Helvetica 20 on a 600 × 800 page. */
function makePdf(pages: [string, number][][]): Uint8Array {
  const objs: string[] = [];
  const font = 3 + pages.length * 2;
  objs.push("<< /Type /Catalog /Pages 2 0 R >>");
  objs.push(`<< /Type /Pages /Kids [${pages.map((_, i) => `${String(3 + i * 2)} 0 R`).join(" ")}] /Count ${String(pages.length)} >>`);
  for (const [i, lines] of pages.entries()) {
    const stream = lines.map(([t, y]) => `BT /F1 20 Tf 50 ${String(y)} Td (${t}) Tj ET`).join("\n");
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Contents ${String(4 + i * 2)} 0 R /Resources << /Font << /F1 ${String(font)} 0 R >> >> >>`);
    objs.push(`<< /Length ${String(stream.length)} >>\nstream\n${stream}\nendstream`);
  }
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const [i, body] of objs.entries()) {
    offsets.push(out.length);
    out += `${String(i + 1)} 0 obj\n${body}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${String(objs.length + 1)}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${String(objs.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

// pdf.js's legacy build in Node (the modern one wants Uint8Array#toHex); the browser worker loads the modern one.
describe("extractPdf (pdf.js)", () => {
  it("places each sentence at its line's top on its page (V41 pdf:<page>:<y‰>), across pages", async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const data = makePdf([
      [
        ["Hello there. This one", 700],
        ["goes on", 400],
      ],
      [
        ["over the page. Last line here.", 100],
      ],
    ]);
    const task = pdfjs.getDocument({ data, useSystemFonts: false, disableFontFace: true, verbosity: 0 });
    const out = await collect(async (emit) => extractPdf(await task.promise, emit, live()));
    await task.destroy();
    // Baseline 700 + 20 pt of text = top 720 of 800 ⇒ 80 down ⇒ 100‰. Baseline 100 ⇒ top 120 ⇒ 680 down ⇒ 850‰.
    expect(out.map((s) => [s.text, s.locator])).toEqual([
      ["Hello there.", "pdf:1:100"],
      ["This one goes on over the page.", "pdf:1:100"],
      ["Last line here.", "pdf:2:850"],
    ]);
    for (const s of out) expect(parseLocator(s.locator)).not.toBeNull();
  });

  it("stops when aborted", async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = pdfjs.getDocument({ data: makePdf([[["One.", 500]], [["Two.", 500]]]), verbosity: 0 });
    const pdf = await task.promise;
    const ac = new AbortController();
    const out = await collect((emit) => {
      ac.abort();
      return extractPdf(pdf, emit, ac.signal);
    });
    await task.destroy();
    expect(out).toEqual([]);
  });
});

// ── Markdown and text ────────────────────────────────────────────────────

describe("extractMarkdown", () => {
  const md = [
    "Lead in. Before any heading.",
    "",
    "# Café Über",
    "",
    "First under it. Second under it[^1].",
    "",
    "```ts",
    "const skipped = 1;",
    "```",
    "",
    "## Intro",
    "",
    "- A list item.",
    "- Another <script>alert(1)</script> item.",
    "",
    "## Intro",
    "",
    "| a | b |",
    "|---|---|",
    "| Cell one. | Cell two. |",
    "",
    "[^1]: The note is left out.",
  ].join("\n");

  it("places sentences under the same heading anchors the reader renders (V41)", async () => {
    const html = renderToStaticMarkup(React.createElement(ReactMarkdown, { remarkPlugins: MD_REMARK, rehypePlugins: MD_REHYPE, remarkRehypeOptions: MD_REMARK_REHYPE }, md));
    const rendered = [...html.matchAll(/<h[1-6] id="([^"]+)"/g)].map((m) => anchorOf(m[1] ?? "")).filter((a) => a !== null);
    const out = await collect((emit) => {
      extractMarkdown(mdTree(md), emit, live());
    });
    const used = new Set(out.map((s) => parseLocator(s.locator)).map((l) => (l?.kind === "md" ? l.heading : "?")));
    for (const h of used) if (h !== "") expect(rendered).toContain(h);
    expect(rendered).toEqual(["café-über", "intro", "intro-1"]);

    const at = (text: string) => out.find((s) => s.text === text)?.locator;
    expect(at("Lead in.")).toBe("md::0");
    expect(at("Café Über")).toBe("md:café-über:0");
    expect(at("First under it.")).toMatch(/^md:café-über:\d/);
    expect(at("A list item.")).toMatch(/^md:intro:/);
    expect(at("Cell one.")).toMatch(/^md:intro-1:/);
    // Footnote markers and the footnotes themselves, and code, are not read.
    expect(out.map((s) => s.text)).toContain("Second under it.");
    // Raw HTML tags are dropped and the text between them stays, as the reader shows it.
    expect(out.map((s) => s.text)).toContain("Another alert(1) item.");
    expect(out.some((s) => /note is left out|skipped|<|Footnotes/.test(s.text))).toBe(false);
    // Places only move down through a section.
    const ys = out.filter((s) => s.locator.startsWith("md:café-über:")).map((s) => Number(s.locator.split(":")[2]));
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    for (const s of out) expect(parseLocator(s.locator)).not.toBeNull();
    expect(out.map((s) => s.i)).toEqual(out.map((_, k) => k));
  });
});

describe("extractText", () => {
  it("reads paragraphs at blank lines, joins hard-wrapped lines, and places by share of the text", async () => {
    const text = "One line\nwrapped here. Then more.\r\n\r\n   \n" + "Para two. ".repeat(50) + "\n\nEnd.";
    const out = await collect((emit) => {
      extractText(text, emit, live());
    });
    expect(out[0]).toEqual({ i: 0, text: "One line wrapped here.", locator: "md::0" });
    expect(out.at(-1)?.text).toBe("End.");
    const ys = out.map((s) => parseLocator(s.locator)).map((l) => (l?.kind === "md" ? l.y : -1));
    expect(ys.every((y) => y >= 0 && y <= 1000)).toBe(true);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    expect(ys.at(-1)).toBeGreaterThan(ys[1] ?? 1000);
  });
});

// ── The file ─────────────────────────────────────────────────────────────

describe("text.json (V44)", () => {
  const sha = "a".repeat(64);
  const file = (sentences: Sentence[]) => textFileHead("md", sha) + sentences.map((s) => JSON.stringify(s)).join(",") + COMPLETE_TAIL;

  it("reads back a finished file", () => {
    const s = { i: 0, text: "Hi.", locator: "md::0" };
    expect(parseTextFile(file([s]), sha)).toEqual({ v: EXTRACTOR_VERSION, kind: "md", sha256: sha, sentences: [s] });
  });

  it("refuses a file cut short, even where the text holds the tail's words", () => {
    const sneaky = { i: 0, text: COMPLETE_TAIL, locator: "md::0" };
    const whole = file([sneaky]);
    for (let cut = 1; cut < whole.length - 1; cut++) {
      const part = whole.slice(0, cut);
      expect(isCurrent(part.slice(0, 64), part.slice(-COMPLETE_TAIL.length)), part).toBe(false);
    }
    expect(parseTextFile(whole, sha)?.sentences[0]?.text).toBe(COMPLETE_TAIL);
  });

  it("refuses an older extractor's file and another file's", () => {
    const old = file([]).replace(`{"v":${String(EXTRACTOR_VERSION)},`, `{"v":${String(EXTRACTOR_VERSION - 1)},`);
    expect(parseTextFile(old, sha)).toBeNull();
    expect(parseTextFile(file([]), "b".repeat(64))).toBeNull();
    expect(parseTextFile(file([]), sha)?.sentences).toEqual([]);
  });
});
