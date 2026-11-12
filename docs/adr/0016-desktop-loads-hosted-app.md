# ADR-0016: The desktop app loads the hosted Wanheda; no `.env` import

| | |
|---|---|
| Status | Accepted |
| Date | 2026-11-11 |
| Deciders | Isaac Gideon (owner) |

Amends [ADR-0014](0014-desktop-build-and-runtime.md): the Electron shell, its native features (island, shortcuts, quick capture, native folders, ffmpeg, Piper) and its hardening stay. The bundled Next server, the `.env` import and the loopback OAuth relay go, from packaged builds.

## Context

The installer runs Wanheda's Next server on the device. That server talks to the owner's Neon database and signs in through a "Wanheda Desktop" GitHub OAuth app, so on first run the app asks for a `.env` file, or offers demo mode. Since [ADR-0015](0015-open-sign-up-and-admin.md) anyone can sign up, and CI now publishes the installer on GitHub Releases. Someone who isn't the owner has no `.env`, so they can only use demo mode.

Raven (`D:\Vxrcel\email-manager`) asks for nothing because it keeps its data on the device (PGlite) and makes its own secrets. Wanheda's data lives in one shared database behind the hosted app (`https://wanheda-chi.vercel.app`), and the web and the desktop should show the same account.

Almost nothing native depends on the local server. Every native feature goes through the preload's IPC (`window.wanheda`) or a custom scheme (`wanheda-file:`, `wanheda-transcode:`), and main checks each against `appOrigin`. The CSP is one builder for the web and the desktop app, and it already allows both schemes.

## Decision

- **Packaged builds load the hosted app.** `appOrigin` becomes a build-time constant: `WANHEDA_APP_URL`, which defaults to the production URL. It must be `https:`, and it is compared as an exact origin. The installer ships no Next server, no `.env` import, no `secrets.json` and no per-launch token header.
- **Native features are unchanged.** The preload, `bridge.ts`'s sender checks, `policy.ts` and the custom schemes work as before, against the hosted origin. `policy.ts` accepts `https:` for the app origin. Every other origin still gets no preload, and its links go to the system browser.
- **Sign-in is a one-time-token handoff in the system browser.**
  1. The login page in the app offers **Sign in with your browser**. Main makes a random `nonce`, keeps it for 10 minutes and opens `https://<app>/desktop/sign-in?nonce=<nonce>` in the default browser.
  2. The user signs in there as on the web, with any method: GitHub, Google or a passkey.
  3. That page, now signed in, mints a short-lived token with Better Auth's `one-time-token` plugin (single use, about 2 minutes) and redirects to `wanheda://auth?token=<t>&nonce=<nonce>`.
  4. Main accepts the link only if the nonce matches a sign-in it started and hasn't used. This stops login CSRF: a stranger's link can't sign you into their account. Main then loads `https://<app>/api/desktop/redeem?token=<t>` in the app's window. The server verifies the token and sets the session cookie in the app's own cookie jar.

  The "Wanheda Desktop" GitHub OAuth app and the loopback callbacks are no longer needed.
- **Dev keeps the local server.** `desktop:dev` stays on `next dev`. `desktop:preview` and the packaged app use `WANHEDA_APP_URL`, which can point at a Vercel preview deployment for testing.
- **Version skew is expected.** The page updates on every deploy; the shell only updates through the installer (T81's updater). The bridge gets a `version`, and the page feature-detects what it uses, so a new page on an old shell hides a feature instead of breaking it.
- **When the app can't be reached**, main shows its own page: "Can't reach Wanheda", with Retry. A service worker for offline cold starts is a separate task.

## Consequences

- The installer gets smaller: no server folder (measure it in T90). No secret is ever on the device except the session cookie in Electron's encrypted cookie store.
- Web deploys reach desktop users at once, with no new installer.
- **Trust moves to the deployment.** Code from the hosted origin gets the preload's powers: listing the folders the user picked, reading their files through `wanheda-file:`, ffmpeg conversion of granted files, and Piper. Before, that code was pinned inside a reviewed installer; now a bad deploy or an XSS on the hosted site reaches it. Mitigations: the exact `https:` origin, the strict CSP, sandboxed renderers with no Node, every IPC payload checked in `bridge.ts`, file access only to roots the user picked, and media paths only from real `File` objects. Deploys come only from `main`, which carries the tripwire, the forged-commit check and review.
- **No offline cold start.** Today the local server paints pages with the network off. After this change, a cold start with the network off shows the "can't reach" page until the service worker task lands. Once the app is open, it keeps working from the client cache as on the web.
- First paint depends on the network. Vercel's edge and Electron's HTTP cache keep that short, but it is still a network hop. That's a cost against the native-app-feel goal, which the service worker also pays back.
- Demo mode in the desktop app goes; the hosted site's own demo stays.

## Alternatives

- **Keep the local server and bake the credentials into the installer.** Rejected: anyone who downloads it would get the database URL and the OAuth secret.
- **Keep the `.env` import.** Rejected: nobody but the owner can use it.
- **Raven's model: PGlite on the device** (T83). Rejected for now. The desktop's data would be separate from the web's until a sync layer exists. It may come back as an offline mode.

## Amendment, 2026-11-12 (T89)

Built as decided, with three changes in the details:

- **Not Better Auth's `one-time-token` plugin.** Its verify hands the app the browser's own session, so signing out of one would sign out the other. A small plugin of our own (`lib/auth/desktop-handoff.ts`, two server-only endpoints) mints the same kind of token (single use, 2 minutes, only a hash stored) and makes the app a session of its own when the token is spent.
- **A click, not a redirect.** Signed in, `/desktop/sign-in` shows the account and an "Open the Wanheda app" link; the token is minted only then (`/api/desktop/handoff`), and "Use another account" is next to it. It's a link because the CSP's `form-action 'self'` blocks a form's redirect to `wanheda:`.
- **The redeem route needs a header only main sends** (`x-wanheda-redeem`). Without it a stranger could send their token to someone's web browser and sign it into their account.

## Tasks

| Task | What |
|---|---|
| T88 | Shell on the hosted origin: `WANHEDA_APP_URL` (build-time, `https:`, exact origin), `policy.ts` and `bridge.ts` on `https:`, no server start in packaged builds, the "can't reach" page with Retry, `bridge.version`, and the page feature-detecting it. |
| T89 | Sign-in handoff: the `one-time-token` plugin, `/desktop/sign-in` and `/api/desktop/redeem`, the `wanheda://auth` link with its nonce check in main, and "Sign in with your browser" on the login page. Remove the loopback OAuth relay. |
| T90 | Drop the server from the installer: stage, bundle, verify, smoke, the `.env` import and secrets UI, and the Settings → Desktop rows; update `desktop.yml` and `RELEASING.md`. |
| T91 | Service worker for an offline cold start (later). |
