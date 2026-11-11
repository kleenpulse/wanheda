// The Content-Security-Policy, one builder for the web and the desktop app
// (SPEC V67). next.config.ts sends it on every response of a production build;
// the desktop shell runs that same server, so it gets the same policy.
// `next dev` runs without it (it needs eval and a websocket).
//
// What it can't block: inline scripts (Next's RSC payload and the boot
// scripts in app/layout.tsx are inline, and nonces would make every page
// dynamic), and images from any https site (markdown in the reader). What it
// blocks: scripts, workers and frames from anywhere else, eval, plugins, fetch
// to other sites except the voice host and YouTube thumbnails, a planted
// <base>, off-site form posts, and other pages framing Wanheda.

// Relative import: next.config.ts loads this file, and the `@/` alias isn't resolved there.
import { EMBED_ORIGINS } from "../media/url";

/**
 * Voices download from Hugging Face (V46), which redirects the model files to
 * its CDN (`*.hf.co`, by region; older `cdn-lfs*.huggingface.co`). YouTube
 * thumbnails are fetched once into OPFS (T72).
 */
export const CONNECT_HOSTS = ["https://huggingface.co", "https://*.hf.co", "https://*.huggingface.co", "https://i.ytimg.com"] as const;

const DIRECTIVES: readonly (readonly [string, ...string[]])[] = [
  ["default-src", "'self'"],
  // Inline boot scripts and Next's RSC payload; wasm for ONNX speech and pdf.js. Never 'unsafe-eval'.
  ["script-src", "'self'", "'unsafe-inline'", "'wasm-unsafe-eval'"],
  ["style-src", "'self'", "'unsafe-inline'"],
  ["img-src", "'self'", "data:", "blob:", "https:"],
  ["font-src", "'self'", "data:"],
  // Local files are blob: URLs; a pasted direct link may be http or https (V56). The desktop app's
  // native folders are `wanheda-file:` (V72); the web never has that scheme, so it's inert there.
  ["media-src", "'self'", "blob:", "https:", "http:", "wanheda-file:"],
  ["connect-src", "'self'", ...CONNECT_HOSTS, "wanheda-file:", "wanheda-transcode:"],
  // App workers are same-origin; mediabunny's alpha-video pool is a blob: worker.
  ["worker-src", "'self'", "blob:"],
  ["frame-src", ...EMBED_ORIGINS],
  ["object-src", "'none'"],
  ["base-uri", "'self'"],
  ["form-action", "'self'"],
  ["frame-ancestors", "'none'"],
];

export const CSP_HEADER = "Content-Security-Policy";

export function contentSecurityPolicy(): string {
  return DIRECTIVES.map((directive) => directive.join(" ")).join("; ");
}
