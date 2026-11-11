/*
 * bun desktop/scripts/verify.ts <server-dir>
 *
 * Checks a staged or packaged server folder before it ships: nothing secret
 * or test-only inside, no links or junctions (they'd point at the build
 * machine), no native binaries, and the files the app needs at runtime are there.
 */
import { existsSync, lstatSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { FFMPEG_PIN } from "../ffmpeg-pin";

/**
 * The one native binary that ships: sharp for next/image (the money logos),
 * built for this installer's only target, Windows x64.
 */
const NATIVE_OK = /^node_modules\/@img\/sharp-win32-x64\/lib\/sharp-win32-x64-[\d.]+\.node$/;

const REQUIRED = ["server.js", "wanheda-server.cjs", "node_modules/next/package.json", ".next/static", ".next/required-server-files.json", "public"];

export function problemsIn(dir: string): string[] {
  const problems: string[] = [];
  const walk = (path: string) => {
    for (const name of readdirSync(path)) {
      const full = join(path, name);
      const rel = relative(dir, full).split(sep).join("/");
      const stat = lstatSync(full);
      const inPackages = rel.includes("node_modules/");
      if (stat.isSymbolicLink()) problems.push(`link: ${rel}`);
      else if (/^\.env/.test(name)) problems.push(`env file: ${rel}`);
      else if (name === "FRD.md" || name === ".vercel" || name.startsWith("brag-output")) problems.push(`not for shipping: ${rel}`);
      else if (name.endsWith(".node") && !NATIVE_OK.test(rel)) problems.push(`native binary: ${rel}`);
      else if (!inPackages && /\.(test|spec)\.[cm]?[jt]sx?$/.test(name)) problems.push(`test file: ${rel}`);
      else if (rel === ".next/cache") problems.push(`build cache: ${rel}`);
      else if (stat.isDirectory()) walk(full);
    }
  };
  walk(dir);
  for (const file of REQUIRED) if (!existsSync(join(dir, file))) problems.push(`missing: ${file}`);
  return problems;
}

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

export function verifyServerDir(dir: string): void {
  const problems = problemsIn(dir);
  if (problems.length > 0) throw new Error(`The server folder isn't fit to ship (${dir}):\n  ${problems.slice(0, 40).join("\n  ")}`);
  console.log(`verified ${dir}`);
}

if (import.meta.main) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: bun desktop/scripts/verify.ts <server-dir>");
    process.exit(2);
  }
  try {
    verifyServerDir(dir);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}
