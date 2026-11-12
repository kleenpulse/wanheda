# Hand-off — Phase 8: T89, desktop sign-in through the system browser

## State in one paragraph

PR #101 and #102 are merged (`main` at `9f92bcc`). T89 is built on `phase-8/desktop-sign-in`, reviewed (LGTM with nits, nits 1–2 fixed) and committed for its PR. The desktop app's login page offers **Sign in with your browser**: main makes a nonce and opens `<app>/desktop/sign-in?nonce=…`; signed in there (any method), **Open the Wanheda app** mints a single-use token and hands it back through `wanheda://auth?token&nonce`; main checks the nonce and loads `/api/desktop/redeem?token=…` with the `x-wanheda-redeem` header, and the app gets a session of its own. The loopback OAuth relay is gone.

## Done this session

- Verified the T88 hand-off: `main` = `origin/main` = `9f92bcc`, no incoming commits, local tip an ancestor; tripwire clean, typecheck clean, 184 files / 1853 tests. `git tidy` left only `main`.
- T89 (all on `phase-8/desktop-sign-in`):
  - **Server:** `lib/auth/desktop-handoff.ts` (a Better Auth plugin with two server-only endpoints, mint and redeem), `lib/auth/desktop-link.ts` (shared shapes and paths), `lib/auth/server.ts` (plugin added before `nextCookies`), `lib/auth/gate.ts` (`/api/desktop/redeem` public).
  - **Routes and page:** `app/api/desktop/handoff/route.ts`, `app/api/desktop/redeem/route.ts`, `app/(auth)/desktop/sign-in/page.tsx`, `components/auth/other-account-button.tsx`.
  - **Login panel:** `components/auth/sign-in-panel.tsx`: with the bridge's `auth`, "Sign in with your browser" + passkey, providers hidden; if main answers false (dev), the providers come back. `lib/platform/desktop.ts`: `auth?` type + `browserSignIn()`.
  - **Shell:** new `desktop/handoff.ts` (pure: nonce, `authLink` parser, `acceptHandoff`); `main.ts` (IPC `wanheda:sign-in-browser`, `openLink` reads auth links first, `finishBrowserSignIn`, hosted authorize navigation ⇒ browser sign-in, dev ⇒ GitHub auth window); `bridge.ts` (`BRIDGE_VERSION` 2, channel); `preload.ts` (`auth.signInWithBrowser`).
  - **Relay removed:** `oauth.ts` keeps only `authorizeProvider`; `server/bootstrap.ts`, `server-process.ts`, `scripts/smoke.ts` lose the browser-return path.
  - **Detour fix:** main's `first load:` catch logged Electron's error message, which names the URL of the navigation that cut the load short: with T89, that is the redeem URL **with the token**. Both that catch and the new redeem catch now log the error code only (`loadErrorCode`). Reproduced live before the fix, gone after.
  - Tests: `lib/auth/desktop-handoff.test.ts` (real Better Auth on the memory adapter: own session, single use, expiry, no session ⇒ no mint), `app/api/desktop/routes.test.ts` (header check, shapes, redirects), `desktop/handoff.test.ts`, `desktop/oauth.test.ts` (rewritten), `lib/auth/gate.test.ts` (+1).
  - Docs: `desktop/README.md` (Sign-in section rewritten), ADR-0016 amendment (2026-11-12), SPEC T89 → x and V68 amendment, CHANGELOG line.
- **Owner confirmed 2026-11-12:** `OWNER_EMAILS` is removed from Vercel, and Google sign-in is wired in production.

## Verification

- `bun run typecheck`, `bun run desktop:typecheck` clean; `bun run test` 187 files / 1864 tests pass; tripwire clean; eslint clean on every changed file (full `bun run lint` still crashes on the untracked `brag-output-2026-11-11-164928/`).
- **Real Electron main**, scratch copy (own userData `Wanheda T89 Scratch`, `setAsDefaultProtocolClient` neutralised, `shell.openExternal` stubbed, launched with Playwright `_electron`, `ELECTRON_RUN_AS_NODE` removed from its env), preview mode on `https://wanheda-chi.vercel.app`, 5 runs: bridge version 2 with `auth.signInWithBrowser`; it opens `/desktop/sign-in?nonce=<43 chars>`; a link with another nonce is ignored; its own nonce makes the main window request `/api/desktop/redeem?token=…` with `x-wanheda-redeem: 1`; the same link again is ignored; the island window's call is refused ("Not allowed"); 0 token or nonce in the logs. Scratch userData deleted.

## In progress / not finished

- Nothing half-done in code.

## Decisions made

- **Own plugin, not `one-time-token`:** its verify sets the browser's own session in the app, so sign-out of one would sign out both. Ours makes a new session at redeem (the app's user agent and IP), stores only the token's SHA-256, 120 s, single use (Better Auth's `consumeVerificationValue`, which also checks expiry). Recorded in ADR-0016's amendment.
- **Click to mint:** the page mints nothing on load; "Open the Wanheda app" is a plain `<a>` (no prefetch) to the handoff route. A form can't be used: CSP `form-action 'self'` blocks its redirect to `wanheda:`.
- **Redeem header:** the redeem route is public (the app is signed out when it spends the token), so without the header check anyone could send their own token to a web browser and sign it into their account.
- A cookieless hit on `/api/desktop/handoff` goes through the proxy to `/login?next=/api/desktop/handoff?nonce=…`; after sign-in it mints straight away. Accepted: the page is the normal way in.

## Known problems and risks

- **Not checked against a live auth:** the page and both routes are not on production yet, so the browser half (sign-in page, Chrome's "Open Wanheda?" prompt, the cookie landing in Electron's jar, `/` signed in) can only be checked after the merge deploys. Then check a sign-in in `desktop:preview` end to end, and that signing out of the app leaves the browser signed in.
- **Order matters:** don't build a desktop installer from T89 before the web side is deployed. A T89 shell on today's production opens a sign-in page that is a 404 there.
- Passkeys inside the desktop window on the hosted origin (rpID = the hosted domain) are still not checked.
- `desktop/README.md`'s server section (localhost passkeys, ports, token) is T90's to remove with the server.
- **Still open from earlier:** the real Neon account-deletion test (plan in `2026-11-09-phase-8-account-deletion.md`, "Real Neon deletion, test plan").

## Next steps (in order)

1. Reviewer: the post-push tip check.
2. Owner: merge; production deploys. Then sign in once in `desktop:preview` through the browser and try a native folder and read-aloud on the hosted origin (left open since T88).
3. T90: drop the server from the installer (`phase-8/desktop-no-server`).

## Files to read first

- `docs/adr/0016-desktop-loads-hosted-app.md` (2026-11-12 amendment), SPEC T89 and the V68 amendment
- `lib/auth/desktop-handoff.ts`, `app/api/desktop/{handoff,redeem}/route.ts`, `desktop/handoff.ts`, `desktop/main.ts` (`startBrowserSignIn`, `finishBrowserSignIn`, `openLink`)

## Env / services touched

- None. No new env vars; Vercel needs nothing new. The scratch Electron runs requested `https://wanheda-chi.vercel.app` (the login page and one redeem URL with a fake token, which production doesn't have yet).

## Review state

- T89: Reviewer `LGTM with nits`, no FIX. Fixed: (1) `loadErrorCode` takes digits (`ERR_HTTP2_…`); (2) a failed redeem load's "Can't reach Wanheda" Retry goes to `/login`, never the redeem URL (its token is spent, and Retry can't send main's header), with a test in `origin.test.ts`. Left: (3) a link that comes back too late (or after a newer click) is dropped silently while the login panel still says "Finish signing in in your browser"; the owner just clicks the button again.
