import { mkdirSync, mkdtempSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { FFMPEG_PIN } from "../ffmpeg-pin";
import { mediaProblemsIn, speechProblemsIn } from "./verify";

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

describe("mediaProblemsIn", () => {
  // Sparse files of the pinned sizes: the size is all this check reads (stage.ts and build.ts check the sha256).
  function mediaFolder(): string {
    dir = mkdtempSync(join(tmpdir(), "wanheda-media-"));
    for (const file of FFMPEG_PIN.files) truncateSync(join(writeEmpty(dir, file.as)), file.size);
    return dir;
  }
  const writeEmpty = (folder: string, name: string) => {
    const path = join(folder, name);
    writeFileSync(path, "");
    return path;
  };

  test("the pinned ffmpeg and its licence pass", () => {
    expect(mediaProblemsIn(mediaFolder())).toEqual([]);
  });

  test("another file, a folder, a file of another size or a missing licence fail", () => {
    const d = mediaFolder();
    writeFileSync(join(d, "ffprobe.exe"), "x");
    mkdirSync(join(d, "presets"));
    truncateSync(join(d, "ffmpeg.exe"), 10);
    rmSync(join(d, "FFMPEG-LICENSE.txt"));
    expect(mediaProblemsIn(d).sort()).toEqual(["missing: FFMPEG-LICENSE.txt", "not for shipping: ffprobe.exe", "not for shipping: presets", "not the pinned file: ffmpeg.exe"].sort());
  });
});
