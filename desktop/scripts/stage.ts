/*
 * bun desktop/scripts/stage.ts [--no-build]
 *
 * Builds the web app and stages what the desktop app ships:
 *
 *   desktop/.stage/app     main process + preload + package.json (version from the root)
 *   desktop/.stage/server  Next standalone server, made self-contained
 *
 * Staging copies through Turbopack's junctions (they point at the build
 * machine), leaves out anything secret or test-only, and verifies the result
 * (ADR-0014: 0 links or junctions left).
 */
import { spawnSync } from "node:child_process";
import { cpSync, readFileSync, rmSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { KNOWN_ENV_NAMES } from "../env-file";
import { bundleMain, bundleServer } from "./bundle";
import { verifyServerDir } from "./verify";

export type Stage = { app: string; server: string };

/**
 * `next build` in demo mode: every known name is set empty, so no `.env` file
 * on this machine fills it and no real data is prerendered into the build.
 * The owner's values reach the server at runtime only (SPEC V69, V6).
 */
export function nextBuild(root: string): void {
  const env: Record<string, string | undefined> = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
  // Next still reads .env files, but only fills names that are unset: these stay empty.
  for (const name of KNOWN_ENV_NAMES) env[name] = "";
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  delete env.VERCEL_ENV;
  const next = join(root, "node_modules", "next", "dist", "bin", "next");
  const run = spawnSync(process.env.WANHEDA_NODE || "node", [next, "build"], { cwd: root, env, stdio: "inherit" });
  if (run.status !== 0) throw new Error("next build failed");
}

/** Root-level entries of the standalone folder that never ship. */
const ROOT_SKIP = new Set(["desktop", "e2e", "scripts", "docs", "drizzle", ".vercel", "test-results", "playwright-report", "FRD.md"]);

function keep(standalone: string, src: string): boolean {
  const rel = relative(standalone, src).split(sep).join("/");
  if (rel === "") return true;
  const name = rel.slice(rel.lastIndexOf("/") + 1);
  if (/^\.env/.test(name)) return false;
  if (!rel.includes("/") && (ROOT_SKIP.has(name) || name.startsWith("brag-output"))) return false;
  if (rel === ".next/cache") return false;
  if (!rel.includes("node_modules/") && /\.(test|spec)\.[cm]?[jt]sx?$/.test(name)) return false;
  return true;
}

export async function stage(root: string): Promise<Stage> {
  const out = join(root, "desktop", ".stage");
  const server = join(out, "server");
  const app = join(out, "app");
  const standalone = join(root, ".next", "standalone");
  rmSync(out, { recursive: true, force: true });

  cpSync(standalone, server, { recursive: true, dereference: true, filter: (src) => keep(standalone, src) });
  cpSync(join(root, ".next", "static"), join(server, ".next", "static"), { recursive: true, dereference: true });
  cpSync(join(root, "public"), join(server, "public"), { recursive: true, dereference: true });
  await bundleServer(root, server);

  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string };
  await bundleMain(root, app, {
    name: "wanheda",
    productName: "Wanheda",
    version: pkg.version,
    description: "Wanheda: a personal dashboard and mini OS.",
    author: { name: "Wanheda", email: "kleenpulse@users.noreply.github.com" },
    homepage: "https://github.com/kleenpulse/wanheda",
  });

  verifyServerDir(server);
  return { app, server };
}

export async function buildAndStage(root: string): Promise<Stage> {
  nextBuild(root);
  return stage(root);
}

if (import.meta.main) {
  const root = join(import.meta.dirname, "..", "..");
  const result = process.argv.includes("--no-build") ? await stage(root) : await buildAndStage(root);
  console.log(`staged ${result.app} and ${result.server}`);
}
