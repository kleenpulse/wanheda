/*
 * bun run desktop:dev      Electron on `next dev` (HMR, the repo's own .env files)
 * bun run desktop:preview  the staged app on the hosted Wanheda (WANHEDA_APP_URL, else production)
 *
 * WANHEDA_DEBUG_PORT=9222 opens the Chrome DevTools Protocol on that port (unpackaged only).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { bundleMain, bundleSpeech } from "./bundle";
import { stage } from "./stage";

const root = resolve(import.meta.dirname, "../..");
const preview = process.argv.includes("--preview");

const electron = join(root, "desktop", "node_modules", "electron", "dist", "electron.exe");
if (!existsSync(electron)) {
  console.error("Electron isn't in place yet: run `bun run desktop:setup`.");
  process.exit(1);
}

let entry: string;
if (preview) {
  entry = (await stage(root)).app;
} else {
  entry = join(root, "desktop", ".dev");
  await bundleMain(root, entry);
  // sherpa resolves from desktop/node_modules, up the tree from .dev/speech.
  await bundleSpeech(root, join(entry, "speech"));
}

const env: Record<string, string | undefined> = { ...process.env, WANHEDA_DESKTOP_MODE: preview ? "preview" : "dev", WANHEDA_REPO_ROOT: root };
// Terminals inside VS Code (an Electron app) inherit this; it would start Electron as plain Node.
delete env.ELECTRON_RUN_AS_NODE;
delete env.NODE_OPTIONS;

const child = spawn(electron, [entry], { cwd: root, stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 0));
