import { readFileSync } from "node:fs";
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
