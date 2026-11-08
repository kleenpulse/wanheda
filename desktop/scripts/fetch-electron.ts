/*
 * bun desktop/scripts/fetch-electron.ts
 *
 * Puts the pinned Electron binary in desktop/node_modules/electron/dist,
 * without `install.js` or `@electron/get` (ADR-0014, SPEC V76):
 *
 *   1. take the zip from the local @electron/get cache, or download it from
 *      the GitHub release;
 *   2. check its sha256 against the npm package's `checksums.json` AND the
 *      release's `SHASUMS256.txt`;
 *   3. extract it with Windows' own tar.exe (no native unzip binding);
 *   4. write `path.txt`, which stops `require("electron")` from running
 *      `install.js` by itself.
 *
 * Windows x64 only, like the rest of Phase 8.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expectedSha, shasumsEntry } from "./electron-checksums";

const desktop = join(import.meta.dirname, "..");
const pkgDir = join(desktop, "node_modules", "electron");

if (process.platform !== "win32" || process.arch !== "x64") {
  console.error("fetch-electron: Wanheda's desktop shell builds on Windows x64 only for now.");
  process.exit(1);
}
if (!existsSync(join(pkgDir, "package.json"))) {
  console.error("fetch-electron: run `bun install --cwd desktop --frozen-lockfile --ignore-scripts` first.");
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")) as { version: string };
const name = `electron-v${version}-win32-x64.zip`;
const dist = join(pkgDir, "dist");

if (readOr(join(dist, "version")) === version && readOr(join(pkgDir, "path.txt")) === "electron.exe") {
  console.log(`fetch-electron: Electron ${version} is already in place.`);
  process.exit(0);
}

const fromPackage = expectedSha(readFileSync(join(pkgDir, "checksums.json"), "utf8"), name);
if (!fromPackage) throw new Error(`checksums.json has no entry for ${name}`);

const release = `https://github.com/electron/electron/releases/download/v${version}`;
const shasums = await download(`${release}/SHASUMS256.txt`);
const fromRelease = shasumsEntry(shasums.toString("utf8"), name);
if (fromRelease !== fromPackage) throw new Error(`SHASUMS256.txt (${fromRelease ?? "none"}) and checksums.json (${fromPackage}) disagree for ${name}`);

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

let zipPath = cachedZip(name, fromPackage);
if (zipPath) {
  console.log(`fetch-electron: using the cached ${zipPath}`);
} else {
  console.log(`fetch-electron: downloading ${name} (about 160 MB)`);
  const zip = await download(`${release}/${name}`);
  if (sha256(zip) !== fromPackage) throw new Error(`${name} doesn't match its checksum`);
  const tmpDir = join(desktop, ".electron-zip");
  mkdirSync(tmpDir, { recursive: true });
  zipPath = join(tmpDir, name);
  writeFileSync(zipPath, zip);
}

const staging = `${dist}.tmp`;
rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
// By full path: Windows looks for a bare "tar" in the current folder before PATH.
const tar = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
const extracted = spawnSync(tar, ["-xf", zipPath, "-C", staging], { stdio: "inherit", windowsHide: true });
if (extracted.status !== 0) throw new Error("tar.exe couldn't extract the Electron zip");
if (readOr(join(staging, "version")) !== version) writeFileSync(join(staging, "version"), version);

rmSync(dist, { recursive: true, force: true });
renameSync(staging, dist);
writeFileSync(join(pkgDir, "path.txt"), "electron.exe");
rmSync(join(desktop, ".electron-zip"), { recursive: true, force: true });
console.log(`fetch-electron: Electron ${version} is in ${dist}`);

/** A zip in @electron/get's cache that matches the checksum, or null. */
function cachedZip(file: string, sha: string): string | null {
  const cache = join(process.env.LOCALAPPDATA ?? "", "electron", "Cache");
  if (!process.env.LOCALAPPDATA || !existsSync(cache)) return null;
  for (const dir of readdirSync(cache)) {
    const candidate = join(cache, dir, file);
    if (existsSync(candidate) && sha256(readFileSync(candidate)) === sha) return candidate;
  }
  return null;
}

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30 * 60_000) });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function readOr(path: string): string | null {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return null;
  }
}
