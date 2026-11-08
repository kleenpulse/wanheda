/*
 * bun desktop/scripts/verify.ts <server-dir>
 *
 * Checks a staged or packaged server folder before it ships: nothing secret
 * or test-only inside, no links or junctions (they'd point at the build
 * machine), no native binaries, and the files the app needs at runtime are there.
 */
import { existsSync, lstatSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

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
