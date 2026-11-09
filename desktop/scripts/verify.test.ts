import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { speechProblemsIn } from "./verify";

const NATIVE = ["sherpa-onnx.node", "sherpa-onnx-c-api.dll", "sherpa-onnx-cxx-api.dll", "onnxruntime.dll", "onnxruntime_providers_shared.dll"];
let dir = "";

function speechFolder(): string {
  dir = mkdtempSync(join(tmpdir(), "wanheda-speech-"));
  writeFileSync(join(dir, "wanheda-speech.cjs"), "x");
  mkdirSync(join(dir, "node_modules", "sherpa-onnx-node"), { recursive: true });
  writeFileSync(join(dir, "node_modules", "sherpa-onnx-node", "package.json"), "{}");
  writeFileSync(join(dir, "node_modules", "sherpa-onnx-node", "addon.js"), "x");
  mkdirSync(join(dir, "node_modules", "sherpa-onnx-win-x64"), { recursive: true });
  for (const f of NATIVE) writeFileSync(join(dir, "node_modules", "sherpa-onnx-win-x64", f), "x");
  return dir;
}

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("speechProblemsIn", () => {
  test("the bundle and sherpa's two packages pass", () => {
    expect(speechProblemsIn(speechFolder())).toEqual([]);
  });

  test("another native file, another package, a stray file, a link or a missing dll fail", () => {
    const d = speechFolder();
    writeFileSync(join(d, "node_modules", "sherpa-onnx-node", "evil.dll"), "x");
    mkdirSync(join(d, "node_modules", "left-pad"));
    writeFileSync(join(d, "notes.txt"), "x");
    symlinkSync(tmpdir(), join(d, "node_modules", "sherpa-onnx-node", "out"), "junction");
    rmSync(join(d, "node_modules", "sherpa-onnx-win-x64", "onnxruntime.dll"));
    expect(speechProblemsIn(d).sort()).toEqual(
      [
        "native binary: node_modules/sherpa-onnx-node/evil.dll",
        "not for shipping: node_modules/left-pad",
        "not for shipping: notes.txt",
        "link: node_modules/sherpa-onnx-node/out",
        "missing: node_modules/sherpa-onnx-win-x64/onnxruntime.dll",
      ].sort(),
    );
  });
});
