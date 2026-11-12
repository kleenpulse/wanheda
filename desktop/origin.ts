/*
 * The hosted app the desktop shell loads in preview and packaged builds
 * (ADR-0016, SPEC V67). `WANHEDA_APP_URL` is baked in at bundle time
 * (scripts/bundle.ts); dev keeps its local `next dev` origin.
 */

import { REDEEM_PATH } from "./handoff";

/** Production. A Vercel preview deployment can stand in for testing (`WANHEDA_APP_URL=… bun run desktop:preview`). */
export const DEFAULT_APP_URL = "https://wanheda-chi.vercel.app";

/**
 * The exact origin of an `https:` app URL, or null. Only a bare origin is
 * accepted (an optional trailing `/`): no user info, path, query or hash, so
 * there is one way to spell it and nothing hides in it.
 */
export function parseAppOrigin(raw: string | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
  if (raw !== url.origin && raw !== `${url.origin}/`) return null;
  return url.origin;
}

/** Chromium's ERR_ABORTED: a navigation that was replaced or stopped (a redirect, our own guard). Not a failure. */
const ERR_ABORTED = -3;

/**
 * The page to retry when the main window's own page failed to load (offline,
 * DNS, TLS, the deployment down), or null when the failure isn't one: a
 * subframe, an aborted navigation, or anything but the app's origin.
 */
export function unreachableRetry(failure: { errorCode: number; url: string; isMainFrame: boolean }, appOrigin: string | null): string | null {
  if (!appOrigin || !failure.isMainFrame || failure.errorCode === ERR_ABORTED || failure.errorCode >= 0) return null;
  let url: URL;
  try {
    url = new URL(failure.url);
  } catch {
    return null;
  }
  if (url.origin !== appOrigin) return null;
  // The sign-in's redeem URL holds a spent token and only works with main's header: start again from the login page.
  return url.pathname === REDEEM_PATH ? `${appOrigin}/login` : url.href;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);
}

/**
 * Main's own "Can't reach Wanheda" page: a `data:` URL with no script (its
 * origin is opaque, so the bridge refuses it). Retry is a plain link back to
 * the page that failed; the shell's navigation guard lets the app's origin in.
 */
export function unreachablePage(retry: string, colors: { background: string; ink: string }, titleBarHeight: number): string {
  const href = escapeHtml(retry);
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Can't reach Wanheda</title><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>html,body{height:100%;margin:0;background:${colors.background};color:${colors.ink};font:14px system-ui,sans-serif;display:grid;place-items:center}main{max-width:26rem;padding:2rem;text-align:center}h1{font-size:1.125rem;font-weight:600;margin:0 0 .5rem}p{margin:0 0 1.25rem;line-height:1.5;opacity:.8}a{display:inline-block;padding:.5rem 1.25rem;border-radius:999px;background:${colors.ink};color:${colors.background};text-decoration:none;font-weight:600}i{position:fixed;inset:0 0 auto;height:${String(titleBarHeight)}px;app-region:drag}</style><i></i><main><h1>Can't reach Wanheda</h1><p>Check your internet connection, then try again.</p><a href="${href}">Retry</a></main></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
