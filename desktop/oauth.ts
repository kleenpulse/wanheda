/*
 * GitHub sign-in in the system browser (V68), the way VS Code and gh do it.
 *
 * The app's window starts the sign-in (Better Auth sets its signed state
 * cookie in the app's session) and main opens GitHub's authorize page in the
 * default browser instead of letting the window go there. GitHub sends the
 * browser back to the local server's callback. That request has no token, so
 * the server hands its query to main and answers the tab with a short "back to
 * Wanheda" page. Main checks the query against the sign-in it started, then
 * loads the callback in the app's window, where the state cookie and token
 * are, and Better Auth finishes the sign-in there.
 */

import { ORIGIN_HOST } from "./shared";

export const CALLBACK_PATH = "/api/auth/callback/github";
/** Where the browser tab ends up: the code is gone from its address bar and history. */
export const RETURNED_PATH = "/desktop/signed-in";

/**
 * How long main waits for the browser to come back: Better Auth's verification
 * row lives this long. Its signed state cookie lapses after 5 minutes, so a
 * slower return still reaches Better Auth, which answers with its own "try
 * again" on the login page rather than nothing happening.
 */
export const SIGN_IN_TTL_MS = 10 * 60_000;

const MAX_PARAM = 1024;
const STATE = /^[\w.~-]{16,256}$/;
const RELAYED = ["code", "state", "error", "error_description", "error_uri"] as const;

export type PendingSignIn = { state: string; expiresAt: number };

/**
 * The sign-in a GitHub authorize URL starts, if it sends GitHub back to this
 * app's callback. Anything else (another client's redirect, no state) is null.
 */
export function signInFrom(authorizeUrl: string, appOrigin: string | null, now: number): PendingSignIn | null {
  if (!appOrigin) return null;
  let url: URL;
  try {
    url = new URL(authorizeUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.host !== "github.com" || url.pathname !== "/login/oauth/authorize") return null;
  if (url.searchParams.get("redirect_uri") !== `${appOrigin}${CALLBACK_PATH}`) return null;
  const state = url.searchParams.get("state");
  if (!state || !STATE.test(state)) return null;
  return { state, expiresAt: now + SIGN_IN_TTL_MS };
}

/**
 * The callback query to load in the app's window, or null when it isn't the
 * answer to the pending sign-in: wrong or missing state, expired, neither a
 * code nor an error, a repeated or oversized parameter. Rebuilt from the known
 * parameters only.
 */
export function callbackQuery(search: string, pending: PendingSignIn | null, now: number): string | null {
  if (!pending || now > pending.expiresAt || search.length > 4 * MAX_PARAM) return null;
  const params = new URLSearchParams(search);
  const out = new URLSearchParams();
  for (const key of RELAYED) {
    const values = params.getAll(key);
    if (values.length > 1) return null;
    const value = values[0];
    if (value === undefined) continue;
    if (value === "" || value.length > MAX_PARAM) return null;
    out.set(key, value);
  }
  if (out.get("state") !== pending.state) return null;
  if (out.has("code") === out.has("error")) return null;
  return out.toString();
}

export type BrowserReturn = { kind: "callback"; search: string } | { kind: "returned" } | null;

/**
 * The only requests the local server answers without the token: GitHub's
 * redirect back to the callback, and the page it then moves the tab to. Both
 * are plain GETs that must still name the server exactly (Host), so a
 * DNS-rebinding page can't reach them either. The token-carrying app request
 * to the same callback goes to Next as usual.
 */
export function browserReturn(method: string | undefined, rawUrl: string | undefined, host: string | undefined, port: number, hasToken: boolean): BrowserReturn {
  if (hasToken || method !== "GET" || !rawUrl || host !== `${ORIGIN_HOST}:${port}`) return null;
  let url: URL;
  try {
    url = new URL(rawUrl, `http://${ORIGIN_HOST}:${port}`);
  } catch {
    return null;
  }
  if (url.pathname === CALLBACK_PATH) return { kind: "callback", search: url.search };
  if (url.pathname === RETURNED_PATH && url.search === "") return { kind: "returned" };
  return null;
}

/** The tab's page: no script, no outside requests, nothing to cache. */
export const RETURNED_HEADERS: Readonly<Record<string, string>> = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

export const RETURNED_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Back to Wanheda</title>
<style>
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: Canvas; color: CanvasText; }
  main { max-width: 26rem; padding: 2rem; text-align: center; }
  h1 { font-size: 1.25rem; font-weight: 600; margin: 0 0 0.5rem; }
  p { margin: 0 0 0.5rem; opacity: 0.7; line-height: 1.5; }
</style>
</head>
<body>
<main>
<h1>Back to Wanheda</h1>
<p>The sign-in continues in the Wanheda app. You can close this tab.</p>
<p>If Wanheda didn't sign you in, start again from the app.</p>
</main>
</body>
</html>
`;
