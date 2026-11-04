import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Bun runs lifecycle scripts for packages on its built-in allowlist
// (`bun pm default-trusted`, esbuild included) unless package.json sets
// `trustedDependencies`. An empty list turns that allowlist off, so no
// install script runs on this machine (SPEC C1).
describe("install scripts", () => {
  it("package.json sets trustedDependencies to an empty list", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      trustedDependencies?: unknown;
    };
    expect(Array.isArray(pkg.trustedDependencies)).toBe(true);
    expect(pkg.trustedDependencies).toEqual([]);
  });
});
