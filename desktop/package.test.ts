import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// The desktop folder's own install follows the root's rules (SPEC C1, V76):
// no install scripts, exact pins, releases at least 7 days old, and Electron
// fetched by our own script, never by its install.js.
const read = (path: string) => readFileSync(join(import.meta.dirname, path), "utf8");

describe("desktop install", () => {
  const pkg = JSON.parse(read("package.json")) as { trustedDependencies?: unknown; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

  test("trustedDependencies is an empty list", () => {
    expect(pkg.trustedDependencies).toEqual([]);
  });

  test("every version is pinned exactly", () => {
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(Object.keys(all).length).toBeGreaterThan(0);
    for (const [name, version] of Object.entries(all)) expect(version, name).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("Electron and the builder are the ADR-0014 pins", () => {
    expect(pkg.devDependencies?.electron).toBe("45.2.0");
    expect(pkg.devDependencies?.["electron-builder"]).toBe("26.18.1");
  });

  test("native Piper is the ADR-0014 pin, a dev dependency (stage.ts copies it into speech/; electron-builder packs nothing)", () => {
    expect(pkg.devDependencies?.["sherpa-onnx-node"]).toBe("2.0.1");
    expect(pkg.devDependencies?.["sherpa-onnx-win-x64"]).toBe("2.0.1");
    expect(pkg.dependencies).toBeUndefined();
  });

  test("installs only take releases at least 7 days old", () => {
    expect(read("bunfig.toml")).toMatch(/^minimumReleaseAge = 604800$/m);
  });

  test("no root script runs Electron's install.js or skips --ignore-scripts", () => {
    const root = JSON.parse(read("../package.json")) as { scripts: Record<string, string> };
    const desktop = Object.entries(root.scripts).filter(([name]) => name.startsWith("desktop:"));
    expect(desktop.length).toBeGreaterThan(0);
    for (const [name, script] of desktop) {
      expect(script, name).not.toMatch(/install\.js|@electron\/get/);
      if (/bun install/.test(script)) expect(script, name).toMatch(/--frozen-lockfile --ignore-scripts/);
    }
  });
});
