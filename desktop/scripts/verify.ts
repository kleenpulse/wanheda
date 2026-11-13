/*
 * Checks the folders that ship next to the app before they are packed: the
 * speech process (native Piper) and the pinned ffmpeg. No links or junctions
 * (they would point at the build machine) and no native file but the pinned ones.
 */
import { existsSync, lstatSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { FFMPEG_PIN } from "../ffmpeg-pin";

/** The speech folder's only native files: sherpa-onnx and onnxruntime for Windows x64 (ADR-0014). */
const SPEECH_NATIVE = new Set([
  "node_modules/sherpa-onnx-win-x64/sherpa-onnx.node",
  "node_modules/sherpa-onnx-win-x64/sherpa-onnx-c-api.dll",
  "node_modules/sherpa-onnx-win-x64/sherpa-onnx-cxx-api.dll",
  "node_modules/sherpa-onnx-win-x64/onnxruntime.dll",
  "node_modules/sherpa-onnx-win-x64/onnxruntime_providers_shared.dll",
]);

const SPEECH_REQUIRED = ["wanheda-speech.cjs", "node_modules/sherpa-onnx-node/package.json", ...SPEECH_NATIVE];

/** A speech folder (V73): the bundle and the two sherpa packages, no links, and no native file but sherpa's own. */
export function speechProblemsIn(dir: string): string[] {
  const problems: string[] = [];
  const walk = (path: string) => {
    for (const name of readdirSync(path)) {
      const full = join(path, name);
      const rel = relative(dir, full).split(sep).join("/");
      const stat = lstatSync(full);
      if (stat.isSymbolicLink()) problems.push(`link: ${rel}`);
      else if (stat.isDirectory()) {
        if (rel !== "node_modules" && !/^node_modules\/sherpa-onnx-(node|win-x64)(\/|$)/.test(rel)) problems.push(`not for shipping: ${rel}`);
        else walk(full);
      } else if (/\.(node|dll|exe)$/i.test(name) && !SPEECH_NATIVE.has(rel)) problems.push(`native binary: ${rel}`);
      else if (!rel.startsWith("node_modules/") && rel !== "wanheda-speech.cjs") problems.push(`not for shipping: ${rel}`);
    }
  };
  walk(dir);
  for (const file of SPEECH_REQUIRED) if (!existsSync(join(dir, file))) problems.push(`missing: ${file}`);
  return problems;
}

/** A media folder (V74): the pinned ffmpeg and its licence text, each at its pinned size, and nothing else. */
export function mediaProblemsIn(dir: string): string[] {
  const problems: string[] = [];
  const want = new Map<string, number>(FFMPEG_PIN.files.map((file) => [file.as, file.size]));
  for (const name of readdirSync(dir)) {
    const stat = lstatSync(join(dir, name));
    const size = want.get(name);
    if (stat.isSymbolicLink()) problems.push(`link: ${name}`);
    else if (size === undefined || !stat.isFile()) problems.push(`not for shipping: ${name}`);
    else if (stat.size !== size) problems.push(`not the pinned file: ${name}`);
  }
  for (const name of want.keys()) if (!existsSync(join(dir, name))) problems.push(`missing: ${name}`);
  return problems;
}

export function verifyMediaDir(dir: string): void {
  const problems = mediaProblemsIn(dir);
  if (problems.length > 0) throw new Error(`The media folder isn't fit to ship (${dir}):\n  ${problems.slice(0, 40).join("\n  ")}`);
  console.log(`verified ${dir}`);
}

export function verifySpeechDir(dir: string): void {
  const problems = speechProblemsIn(dir);
  if (problems.length > 0) throw new Error(`The speech folder isn't fit to ship (${dir}):\n  ${problems.slice(0, 40).join("\n  ")}`);
  console.log(`verified ${dir}`);
}
