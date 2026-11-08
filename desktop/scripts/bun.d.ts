// The one Bun API the desktop scripts use, typed here so the folder needs no
// extra type package. The scripts run under `bun`.
declare const Bun: {
  build(options: {
    entrypoints: string[];
    outdir: string;
    naming: string;
    target: "node";
    format: "cjs";
    external: string[];
    define?: Record<string, string>;
  }): Promise<{ success: boolean; logs: unknown[] }>;
};
