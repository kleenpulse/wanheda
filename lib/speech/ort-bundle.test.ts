import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// SPEC V45, ADR-0012: the speech worker ships onnxruntime-web's plain wasm
// build and `phonemizer`, and none of it may compile code from a string (the
// V40 rule: a voice model is untrusted input). Same check as the pdf.js one.
// A bump that brings eval back fails here; so does an alias that stops
// pointing at the file this checks.

// Read from node_modules directly: onnxruntime-web's exports hide its package.json, and the alias points here too.
const modules = join(process.cwd(), "node_modules");
const SHIPPED = [
  join(modules, "onnxruntime-web", "dist", "ort.wasm.min.mjs"),
  join(modules, "onnxruntime-web", "dist", "ort-wasm-simd-threaded.mjs"),
  join(modules, "phonemizer", "dist", "phonemizer.js"),
];
const version = (pkg: string) => (JSON.parse(readFileSync(join(modules, pkg, "package.json"), "utf8")) as { version: string }).version;

const FORBIDDEN: [string, RegExp][] = [
  ["Function constructor", /(?<![\w$])Function\s*\(/],
  ["eval", /(?<![\w$])eval\s*\(/],
  ["string setTimeout/setInterval", /\bset(?:Timeout|Interval)\s*\(\s*["'`]/],
  ["importScripts", /\bimportScripts\s*\(/],
];

describe("speech runtime files are eval-free (V45)", () => {
  for (const file of SHIPPED) {
    it(file.replace(/.*node_modules[\\/]/, ""), () => {
      const code = readFileSync(file, "utf8");
      expect(code.length).toBeGreaterThan(10_000);
      for (const [name, re] of FORBIDDEN) expect(re.exec(code)?.[0] ?? null, name).toBeNull();
    });
  }

  it("the pinned versions are the ones ADR-0012 cleared", () => {
    expect(version("onnxruntime-web")).toBe("1.31.1");
    expect(version("phonemizer")).toBe("1.2.1");
  });

  it("the worker's runtime alias points at the checked file", () => {
    const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    expect(config).toContain('"onnxruntime-web/wasm": "./node_modules/onnxruntime-web/dist/ort.wasm.min.mjs"');
  });
});
