import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// SPEC V40: PDFs are hostile input, and pdf.js must never compile code from
// one. pdf.js 6 removed its eval path (and the `isEvalSupported` option with
// it), so instead of passing a dead option this checks the bundles the
// reader actually ships: no Function constructor, no eval, no string timer.
// An upgrade that brings any of them back fails here.

const require = createRequire(import.meta.url);
const BUNDLES = ["pdfjs-dist/build/pdf.min.mjs", "pdfjs-dist/build/pdf.worker.min.mjs"];

const FORBIDDEN: [string, RegExp][] = [
  ["Function constructor", /(?<![\w$])Function\s*\(/],
  ["eval", /(?<![\w$])eval\s*\(/],
  ["string setTimeout/setInterval", /\bset(?:Timeout|Interval)\s*\(\s*["'`]/],
  ["importScripts", /\bimportScripts\s*\(/],
];

describe("pdf.js bundles are eval-free (V40)", () => {
  for (const bundle of BUNDLES) {
    it(bundle, () => {
      const code = readFileSync(require.resolve(bundle), "utf8");
      expect(code.length).toBeGreaterThan(100_000);
      for (const [name, re] of FORBIDDEN) expect(re.exec(code)?.[0] ?? null, name).toBeNull();
    });
  }

  it("the check itself catches each form", () => {
    for (const sample of ["x=new Function('a')", "x=Function('a')", "eval('a')", "setTimeout('a()',1)", "importScripts(u)"]) {
      expect(FORBIDDEN.some(([, re]) => re.test(sample)), sample).toBe(true);
    }
    expect(FORBIDDEN.some(([, re]) => re.test("new FunctionBasedShading(d)"))).toBe(false);
  });
});

// T49: CMaps and standard fonts are served from this origin, one hashed asset
// each (components/reader/pdf/pdf-data.ts). An upgrade that adds or drops a
// file must regenerate that map, or a document needing the file would fall
// back to the system (or show nothing).
describe("pdf.js data files are all served same-origin (V40)", () => {
  const dist = dirname(require.resolve("pdfjs-dist/package.json"));
  it("every CMap and standard font has an asset, and nothing else does", async () => {
    const { CMAPS, STANDARD_FONTS } = await import("@/components/reader/pdf/pdf-data");
    const cmaps = readdirSync(join(dist, "cmaps")).filter((f) => f.endsWith(".bcmap")).sort();
    const fonts = readdirSync(join(dist, "standard_fonts")).filter((f) => /\.(pfb|ttf)$/.test(f)).sort();
    expect(cmaps.length).toBeGreaterThan(100);
    expect(Object.keys(CMAPS).sort()).toEqual(cmaps);
    expect(Object.keys(STANDARD_FONTS).sort()).toEqual(fonts);
    for (const [name, url] of [...Object.entries(CMAPS), ...Object.entries(STANDARD_FONTS)]) expect(url.pathname.endsWith(`/${name}`)).toBe(true);
  });
});
