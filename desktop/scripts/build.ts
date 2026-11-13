/*
 * bun run desktop:build
 *
 * Stages the app, makes the Windows installer (NSIS, x64, per-user) with
 * electron-builder run by Node, then checks what got packaged (speech, media,
 * no server folder, Electron fuses) and writes SHA256SUMS.txt next to it. The
 * app loads the hosted Wanheda (ADR-0016), so there is no web build here.
 *
 * Unsigned for now (SPEC V75). Installers for the owner come from CI (T81).
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { stage } from "./stage";
import { FFMPEG_PIN } from "../ffmpeg-pin";
import { inPlace } from "./fetch-ffmpeg";
import { verifyMediaDir, verifySpeechDir } from "./verify";

if (process.platform !== "win32") {
  console.error("desktop:build makes the Windows installer, on Windows.");
  process.exit(1);
}

const root = resolve(import.meta.dirname, "../..");
const desktop = join(root, "desktop");
const out = join(desktop, ".out");

// These would send electron-builder's toolset downloads elsewhere (ADR-0014).
for (const name of Object.keys(process.env)) {
  if (/^(NPM_CONFIG_)?ELECTRON_BUILDER_(.*_PATH|BINARIES_DOWNLOAD_OVERRIDE_URL|BINARIES_CUSTOM_DIR)$/i.test(name)) {
    console.error(`desktop:build: unset ${name} first.`);
    process.exit(1);
  }
}

await stage(root);

const builder = join(desktop, "node_modules", "electron-builder", "cli.js");
const env: Record<string, string | undefined> = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.NODE_OPTIONS;
const packed = spawnSync(process.env.WANHEDA_NODE || "node", [builder, "--config", "electron-builder.yml", "--publish", "never", "--win", "nsis", "--x64"], {
  cwd: desktop,
  env,
  stdio: "inherit",
});
if (packed.status !== 0) throw new Error("electron-builder failed");

const unpacked = join(out, "win-unpacked");
// The installer ships no Next server (ADR-0016): a stale folder in .stage must not sneak one in.
if (existsSync(join(unpacked, "resources", "server"))) throw new Error("the packaged app has a server folder; it must not (ADR-0016)");
verifySpeechDir(join(unpacked, "resources", "speech"));
const packedMedia = join(unpacked, "resources", "media");
verifyMediaDir(packedMedia);
for (const file of FFMPEG_PIN.files) if (!(await inPlace(file, packedMedia))) throw new Error(`the packaged ${file.as} isn't the pinned file`);

// Positions on Electron 45's fuse wire. @electron/fuses (pinned by
// electron-builder 26) names only the first eight, so the list lives here.
const FUSE_INDEX: Record<string, number> = {
  runAsNode: 0,
  enableCookieEncryption: 1,
  enableNodeOptionsEnvironmentVariable: 2,
  enableNodeCliInspectArguments: 3,
  enableEmbeddedAsarIntegrityValidation: 4,
  onlyLoadAppFromAsar: 5,
  loadBrowserProcessSpecificV8Snapshot: 6,
  grantFileProtocolExtraPrivileges: 7,
  wasmTrapHandlers: 8,
};
// FuseState in @electron/fuses: the wire holds ASCII "0" / "1".
const ENABLED = 49;
const DISABLED = 48;
// The electronFuses block of electron-builder.yml, plus the one it can't set yet:
// wasmTrapHandlers stays at Electron's default (on); speech runs on WebAssembly.
const fuseBlock = /^electronFuses:\r?\n((?:[ \t]+\w+: (?:true|false)\r?\n)+)/m.exec(readFileSync(join(desktop, "electron-builder.yml"), "utf8"))?.[1] ?? "";
const expected = [...fuseBlock.matchAll(/(\w+): (true|false)/g)].map(([, key, value]) => ({ name: key ?? "", on: value === "true" }));
if (expected.length !== 8) throw new Error(`expected 8 electronFuses in electron-builder.yml, found ${expected.length}`);
expected.push({ name: "wasmTrapHandlers", on: true });
type FusesLib = { getCurrentFuseWire(pathToElectron: string): Promise<Record<string, number | string>> };
const fusesLib = (await import(join(desktop, "node_modules", "@electron", "fuses", "dist", "index.js"))) as FusesLib;
const wire = await fusesLib.getCurrentFuseWire(join(unpacked, "Wanheda.exe"));
const wrong = expected.filter(({ name, on }) => {
  const index = FUSE_INDEX[name];
  if (index === undefined) throw new Error(`unknown fuse ${name} in electron-builder.yml`);
  const state = wire[index];
  console.log(`  ${name} is ${state === ENABLED ? "Enabled" : state === DISABLED ? "Disabled" : `in state ${String(state)}`}`);
  return state !== (on ? ENABLED : DISABLED);
});
if (wrong.length > 0) throw new Error(`fuses aren't set as expected: ${wrong.map((fuse) => fuse.name).join(", ")}`);

const shipped = readdirSync(out).filter((f) => /\.(exe|blockmap)$/.test(f) || /^latest\.yml$/.test(f));
const sums = shipped.map((f) => `${createHash("sha256").update(readFileSync(join(out, f))).digest("hex")}  ${f}`);
writeFileSync(join(out, "SHA256SUMS.txt"), `${sums.join("\n")}\n`);
console.log(sums.join("\n"));
