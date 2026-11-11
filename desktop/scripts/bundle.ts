import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_APP_URL, parseAppOrigin } from "../origin";

/*
 * Bun.build bundles the main process, the preload and the server bootstrap
 * into ignored folders (.dev, .stage), so no .js file is ever tracked (SPEC V76, V1).
 */

async function bundle(entry: string, outDir: string, naming: string, external: string[], define: Record<string, string> = {}): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  const result = await Bun.build({ entrypoints: [entry], outdir: outDir, naming, target: "node", format: "cjs", external, define });
  if (!result.success) {
    for (const message of result.logs) console.error(message);
    throw new Error(`bundling ${entry} failed`);
  }
}

const APP_ICONS = ["icon.png", "tray.png", "tray@2x.png"];

/**
 * The hosted app preview and packaged builds load (ADR-0016): `WANHEDA_APP_URL`
 * from the environment (a Vercel preview, say), else production. Not a secret.
 * Refused unless it is a bare https origin; main checks it again at start.
 */
export function appUrl(env: Record<string, string | undefined> = process.env): string {
  const raw = env.WANHEDA_APP_URL || DEFAULT_APP_URL;
  const origin = parseAppOrigin(raw);
  if (!origin) throw new Error(`WANHEDA_APP_URL must be a bare https origin, like ${DEFAULT_APP_URL}`);
  return origin;
}

/**
 * The main process → `<outDir>/main.js` and the window's preload →
 * `<outDir>/preload.js` (CommonJS, Electron left external), plus the
 * package.json Electron starts from and the window, tray and notification icons.
 */
export async function bundleMain(root: string, outDir: string, manifest: Record<string, unknown> = { name: "wanheda-dev", productName: "Wanheda" }): Promise<void> {
  // Baked in, so the installed app can't be pointed elsewhere by its environment.
  await bundle(join(root, "desktop", "main.ts"), outDir, "main.js", ["electron"], { "process.env.WANHEDA_APP_URL": JSON.stringify(appUrl()) });
  await bundle(join(root, "desktop", "preload.ts"), outDir, "preload.js", ["electron"]);
  for (const icon of APP_ICONS) copyFileSync(join(root, "desktop", "build", icon), join(outDir, icon));
  writeFileSync(join(outDir, "package.json"), `${JSON.stringify({ ...manifest, main: "main.js" }, null, 2)}\n`);
}

/** The server bootstrap → `<serverDir>/wanheda-server.cjs`; it loads Next from that folder's node_modules at runtime. */
export async function bundleServer(root: string, serverDir: string): Promise<void> {
  await bundle(join(root, "desktop", "server", "bootstrap.ts"), serverDir, "wanheda-server.cjs", []);
}

/**
 * The speech process → `<speechDir>/wanheda-speech.cjs`. The native addon
 * (sherpa-onnx-node) stays external: it loads from that folder's node_modules,
 * or desktop/node_modules in dev.
 */
export async function bundleSpeech(root: string, speechDir: string): Promise<void> {
  await bundle(join(root, "desktop", "speech", "speech-process.ts"), speechDir, "wanheda-speech.cjs", ["sherpa-onnx-node"]);
}
