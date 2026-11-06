import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { describe, expect, it } from "vitest";
import { anchorOf, findRanges, idOf, lineFor, placeAt, scrollPercent, shikiLang, type Section } from "./md";
import { MD_REHYPE, MD_REMARK, MD_REMARK_REHYPE } from "./md-pipeline";
import { formatLocator, parseLocator } from "./reader";

function render(md: string): string {
  return renderToStaticMarkup(
    React.createElement(ReactMarkdown, { remarkPlugins: MD_REMARK, rehypePlugins: MD_REHYPE, remarkRehypeOptions: MD_REMARK_REHYPE }, md),
  );
}

describe("pipeline (V40)", () => {
  it("drops raw HTML and javascript: links, keeps https ones", () => {
    const html = render('# T\n\n<b id="x" onclick="alert(1)">raw</b> <script>alert(1)</script>\n\n[bad](javascript:alert(1)) [ok](https://example.com)');
    expect(html).not.toContain("<b");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="https://example.com"');
  });

  it("slugs headings after sanitizing: one prefix, Unicode kept, duplicates numbered", () => {
    const html = render("# Café Über\n\n## Intro\n\n## Intro\n\nA note[^1].\n\n[^1]: The note.");
    expect(html).toContain('id="user-content-café-über"');
    expect(html).toContain('id="user-content-intro"');
    expect(html).toContain('id="user-content-intro-1"');
    expect(html).toContain('id="user-content-fn-1"');
    expect(html).not.toContain("user-content-user-content-");
  });

  it("keeps a fence's language class for Shiki", () => {
    expect(render("```ts\nconst a = 1\n```")).toContain('class="language-ts"');
  });
});

describe("locator (V41)", () => {
  it("takes a heading id to a locator and back, Unicode included", () => {
    const anchor = anchorOf("user-content-café-über");
    expect(anchor).toBe("café-über");
    const raw = formatLocator({ kind: "md", heading: anchor ?? "", y: 350 });
    expect(raw).toBe("md:café-über:350");
    expect(parseLocator(raw)).toEqual({ kind: "md", heading: "café-über", y: 350 });
    expect(idOf("café-über")).toBe("user-content-café-über");
  });

  it("refuses ids that aren't the reader's headings", () => {
    expect(anchorOf("intro")).toBeNull();
    expect(anchorOf("user-content-")).toBeNull();
    expect(anchorOf("user-content-a:b")).toBeNull();
    expect(parseLocator("md:a b:10")).toBeNull();
  });

  const sections: Section[] = [
    { anchor: "one", top: 100 },
    { anchor: "two", top: 300 },
    { anchor: "three", top: 700 },
  ];

  it("places the line in its section", () => {
    expect(placeAt(sections, 50, 1000)).toEqual({ heading: "", y: 500 });
    expect(placeAt(sections, 100, 1000)).toEqual({ heading: "one", y: 0 });
    expect(placeAt(sections, 500, 1000)).toEqual({ heading: "two", y: 500 });
    expect(placeAt(sections, 850, 1000)).toEqual({ heading: "three", y: 500 });
    expect(placeAt([], 250, 1000)).toEqual({ heading: "", y: 250 });
  });

  it("resumes at the same fraction of the same section on another layout", () => {
    const wider: Section[] = [
      { anchor: "one", top: 80 },
      { anchor: "two", top: 200 },
      { anchor: "three", top: 420 },
    ];
    const place = placeAt(sections, 500, 1000);
    expect(lineFor(wider, place, 600)).toBe(310);
    expect(lineFor(sections, place, 1000)).toBe(500);
    expect(lineFor(sections, { heading: "", y: 500 }, 1000)).toBe(50);
    expect(lineFor(sections, { heading: "gone", y: 500 }, 1000)).toBeNull();
  });

  it("counts a document with nothing to scroll as read", () => {
    expect(scrollPercent(0, 0)).toBe(100);
    expect(scrollPercent(250, 1000)).toBe(25);
    expect(scrollPercent(1200, 1000)).toBe(100);
  });
});

describe("find", () => {
  it("matches case-insensitively over the original text, whitespace-tolerant", () => {
    expect(findRanges("The Needle and the\nneedle", "needle")).toEqual([
      [4, 10],
      [19, 25],
    ]);
    expect(findRanges("a  b", "a b")).toEqual([[0, 4]]);
    expect(findRanges("x", "")).toEqual([]);
  });
});

describe("shikiLang", () => {
  it("names a grammar for known fences and aliases, null otherwise", () => {
    expect(shikiLang("ts")).toBe("typescript");
    expect(shikiLang("Python")).toBe("python");
    expect(shikiLang("c++")).toBe("cpp");
    expect(shikiLang("sh")).toBe("bash");
    expect(shikiLang("toString")).toBeNull();
    expect(shikiLang("brainfuck")).toBeNull();
    expect(shikiLang(undefined)).toBeNull();
  });
});
