/**
 * Bundles the offline service worker (lib/sw/worker.ts, T91) into public/sw.js
 * before `next build`. The output is ignored by git: no .js file is ever
 * tracked (SPEC V1). One classic script, no imports left, minified.
 */

// The root program has no Bun types (only desktop/ does): the one call used here.
declare const Bun: {
  build(options: {
    entrypoints: string[];
    outdir: string;
    naming: string;
    target: "browser";
    format: "iife";
    minify: boolean;
    define: Record<string, string>;
  }): Promise<{ success: boolean; logs: unknown[]; outputs: { size: number }[] }>;
};

const OUT_DIR = "public";
const OUT_NAME = "sw.js";

const result = await Bun.build({
  entrypoints: ["lib/sw/worker.ts"],
  outdir: OUT_DIR,
  naming: OUT_NAME,
  target: "browser",
  format: "iife",
  minify: true,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
});

if (!result.success) {
  for (const message of result.logs) console.error(message);
  throw new Error("bundling the service worker failed");
}

const size = result.outputs[0]?.size ?? 0;
console.log(`service worker: ${OUT_DIR}/${OUT_NAME} (${size} B)`);
