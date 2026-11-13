/*
 * bun desktop/scripts/stage.ts
 *
 * Stages what the desktop app ships. It loads the hosted app (ADR-0016), so
 * there is no web build and no server here:
 *
 *   desktop/.stage/app     main process + preload + package.json (version from the root)
 *   desktop/.stage/speech  native Piper (V73)
 *   desktop/.stage/media   the pinned ffmpeg and its licence (V74)
 *
 * Staging copies with links dereferenced and verifies the result (ADR-0014:
 * 0 links or junctions left).
 */
import { copyFileSync, cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { FFMPEG_PIN } from "../ffmpeg-pin";
import { bundleMain, bundleSpeech } from "./bundle";
import { FFMPEG_DIR, inPlace } from "./fetch-ffmpeg";
import { verifyMediaDir, verifySpeechDir } from "./verify";

export type Stage = { app: string };

export async function stage(root: string): Promise<Stage> {
  const out = join(root, "desktop", ".stage");
  const app = join(out, "app");
  rmSync(out, { recursive: true, force: true });

  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string };
  await bundleMain(root, app, {
    name: "wanheda",
    productName: "Wanheda",
    version: pkg.version,
    description: "Wanheda: a personal dashboard and mini OS.",
    author: { name: "Wanheda", email: "kleenpulse@users.noreply.github.com" },
    homepage: "https://github.com/kleenpulse/wanheda",
  });

  // Native Piper (V73): the speech bundle with sherpa's two packages next to it.
  const speech = join(out, "speech");
  await bundleSpeech(root, speech);
  for (const pkg of ["sherpa-onnx-node", "sherpa-onnx-win-x64"]) {
    cpSync(join(root, "desktop", "node_modules", pkg), join(speech, "node_modules", pkg), { recursive: true, dereference: true });
  }

  // Native transcode (V74): the pinned ffmpeg and its licence, checked against the pin again on the way in.
  const media = join(out, "media");
  mkdirSync(media, { recursive: true });
  for (const file of FFMPEG_PIN.files) {
    if (!(await inPlace(file))) throw new Error(`${file.as} isn't in desktop/.ffmpeg, or isn't the pinned file: run \`bun run desktop:setup\`.`);
    copyFileSync(join(FFMPEG_DIR, file.as), join(media, file.as));
    // The copy too: nothing may change it between the check and the installer.
    if (!(await inPlace(file, media))) throw new Error(`${file.as} changed while it was staged.`);
  }

  verifySpeechDir(speech);
  verifyMediaDir(media);
  return { app };
}

if (import.meta.main) {
  const root = join(import.meta.dirname, "..", "..");
  const result = await stage(root);
  console.log(`staged ${result.app}`);
}
