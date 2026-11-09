/*
 * Where a URL may go when a page opens a window or navigates (SPEC V67).
 * Pages from the local server (and blob: URLs they made) stay in the app;
 * http(s) links go to the system browser; everything else is dropped.
 *
 * GitHub and Google sign-in are the one exception (V68): main opens the
 * authorize page in the system browser and finishes the sign-in in the app's
 * window when the browser comes back (desktop/oauth.ts). In dev only, GitHub's
 * OAuth pages open in a separate auth window with no preload instead
 * (classifyAuthUrl).
 */

import { authorizeProvider, type Provider } from "./oauth";

export type Destination =
  | { kind: "app" }
  | { kind: "oauth-sign-in"; provider: Provider; url: string }
  | { kind: "external"; url: string }
  | { kind: "deny" };

const EXTERNAL = new Set(["http:", "https:"]);

function parse(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

export function classifyUrl(raw: string, appOrigin: string | null): Destination {
  const url = parse(raw);
  if (!url) return { kind: "deny" };
  // For blob: URLs, `origin` is the origin that made them.
  if (appOrigin && url.origin === appOrigin && (url.protocol === "http:" || url.protocol === "blob:")) return { kind: "app" };
  const provider = authorizeProvider(url);
  if (provider) return { kind: "oauth-sign-in", provider, url: url.href };
  if (url.protocol === "blob:") return { kind: "deny" };
  if (EXTERNAL.has(url.protocol) && !url.username && !url.password) return { kind: "external", url: url.href };
  return { kind: "deny" };
}

/** GitHub pages a sign-in can pass through: log in, two-factor, device check, authorize. */
const GITHUB_SIGN_IN = /^\/(login|session|sessions)(\/|$)/;

export type AuthStep = { kind: "github" } | { kind: "app"; url: string } | { kind: "external"; url: string } | { kind: "deny" };

/** Where the auth window may go next. Reaching the app's origin ends the sign-in. */
export function classifyAuthUrl(raw: string, appOrigin: string | null): AuthStep {
  const url = parse(raw);
  if (!url || url.username || url.password) return { kind: "deny" };
  if (appOrigin && url.origin === appOrigin && url.protocol === "http:") return { kind: "app", url: url.href };
  if (url.protocol === "https:" && url.host === "github.com" && GITHUB_SIGN_IN.test(url.pathname)) return { kind: "github" };
  // "Forgot password?", "Create an account" and the like: the system browser.
  if (EXTERNAL.has(url.protocol)) return { kind: "external", url: url.href };
  return { kind: "deny" };
}

export type NavigationStep =
  | { kind: "allow" }
  | { kind: "block" }
  | { kind: "oauth-sign-in"; provider: Provider; url: string }
  | { kind: "external"; url: string };

/**
 * What a `will-navigate` or `will-redirect` does. Only the main frame is
 * judged: subframes (embeds, and the ad and consent frames inside them) are
 * left to the CSP's frame-src, as in a browser, so nothing a third-party frame
 * does can open the system browser. The main frame never becomes a blob:
 * document, which would get the preload; blob: URLs only open in child windows.
 */
export function navigationStep(nav: { url: string; isMainFrame: boolean; isAuth: boolean }, appOrigin: string | null): NavigationStep {
  if (!nav.isMainFrame) return { kind: "allow" };
  if (nav.isAuth) {
    const step = classifyAuthUrl(nav.url, appOrigin);
    if (step.kind === "github" || step.kind === "app") return { kind: "allow" };
    return step.kind === "external" ? step : { kind: "block" };
  }
  const destination = classifyUrl(nav.url, appOrigin);
  if (destination.kind === "app") return isBlob(nav.url) ? { kind: "block" } : { kind: "allow" };
  return destination.kind === "deny" ? { kind: "block" } : destination;
}

/**
 * Permissions a page may have (V67), and only on the app's own pages: clipboard
 * writes, full screen (theatre), and folder access (music and video folders,
 * the reader's files). Not geolocation: Electron's location service needs a
 * Google API key, so it only ever fails.
 */
export const ALLOWED_PERMISSIONS: ReadonlySet<string> = new Set(["clipboard-sanitized-write", "fullscreen", "fileSystem"]);

/**
 * Whether a permission is granted. Fullscreen is asked for by the frame that
 * wants it (an embed's own button), so it is judged by the window's page; the
 * embed got that far only through the CSP's frame-src and `allowfullscreen`.
 * Everything else is judged by the frame asking.
 */
export function permissionAllowed(permission: string, frameUrl: string, pageUrl: string, appOrigin: string | null): boolean {
  if (!ALLOWED_PERMISSIONS.has(permission)) return false;
  const judged = permission === "fullscreen" ? pageUrl : frameUrl;
  return classifyUrl(judged, appOrigin).kind === "app" && !isBlob(judged);
}

function isBlob(raw: string): boolean {
  return parse(raw)?.protocol === "blob:";
}
