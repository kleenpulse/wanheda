# Wanheda desktop

The Windows desktop app: an Electron shell around the hosted Wanheda (`https://wanheda-chi.vercel.app`), with native features the web can't have. It is ported from Raven's `desktop/` without mail and PGlite. The decisions behind it are in [ADR-0014](../docs/adr/0014-desktop-build-and-runtime.md), [ADR-0016](../docs/adr/0016-desktop-loads-hosted-app.md) and SPEC V67–V76. The version comes from the root `package.json`.

## The hosted app (ADR-0016)

- `desktop:preview` and the installed app load the address baked into `main.js` when it is bundled: `WANHEDA_APP_URL`, or production when it's unset. It must be a bare `https:` origin (`desktop/origin.ts`); the bundle step and main both refuse anything else. Point a preview at a Vercel preview deployment with `WANHEDA_APP_URL=https://<deployment> bun desktop/scripts/dev.ts --preview`.
- They start no server, ask for no `.env` file and keep no keys: the only secret on the device is the session cookie. The installer ships no server (T90). An upgrade from 0.7.4 or older deletes the old sealed keys (`secrets.json`) at start.
- If the app's page can't load (offline, the deployment down), main shows its own "Can't reach Wanheda" page, with Retry.
- The page updates with every deploy and the shell only with the installer, so the bridge has a `version` (`BRIDGE_VERSION` in `bridge.ts`). A page that uses something newer checks it, or the member it needs, first.
- Data kept per origin (voices in OPFS, the outbox, localStorage) starts fresh once, on the move from `http://localhost:<port>`.
- `desktop:dev` runs `next dev` on localhost, which reads the repo's own `.env` files like `bun run dev` (see "The dev server" below).

## Scripts (run from the repo root)

| Command | What it does |
| --- | --- |
| `bun run desktop:setup` | Installs this folder's packages (no install scripts run), then puts the pinned Electron in place with `scripts/fetch-electron.ts` and the pinned ffmpeg with `scripts/fetch-ffmpeg.ts` (about 55 MB, once). |
| `bun run desktop:dev` | Opens Wanheda in Electron on `next dev`, with hot reload. There's no guard and no CSP in this mode. Stop your own `next dev` first: Next.js allows only one per project. |
| `bun run desktop:preview` | Stages the shell and opens it on the hosted app. There is no web build. |
| `bun run desktop:stage` | Stages only (`desktop/.stage/`): the shell, the speech process and ffmpeg. |
| `bun run desktop:build` | Stages, makes the NSIS installer in `desktop/.out/`, checks the speech and media folders, that no server folder shipped, and Electron's fuses, and writes `SHA256SUMS.txt`. Windows only. Installers for release come only from CI (`.github/workflows/desktop.yml`); see [RELEASING.md](RELEASING.md). |
| `bun run desktop:typecheck` | Type-checks this folder (CI runs it). |

Set `WANHEDA_DEBUG_PORT=9222` to open the Chrome DevTools Protocol on that port. It works in dev and preview only; the installed app refuses to start with a debugging port.

Terminals inside VS Code carry `ELECTRON_RUN_AS_NODE`. The scripts drop it, but if you run `electron.exe` yourself, unset it first, or Electron starts as plain Node.

## How it fits together

- `main.ts` is the main process. It owns the windows, the session and the native features, and in dev the `next dev` process (`dev-server.ts`).
- `scripts/stage.ts` bundles the main process and the preload (with `WANHEDA_APP_URL` baked in), bundles the speech process next to sherpa's two packages, and copies the pinned ffmpeg. `scripts/verify.ts` checks the speech and media folders: no links, and no native file but the pinned ones.
- Every Bun bundle goes into an ignored folder (`.dev`, `.stage`, `.out`), so no `.js` file is ever tracked (V1).
- **Title bar (V67), like VS Code's.** The main window has no Windows title bar (`titleBarStyle: "hidden"`); Windows draws only its caption buttons (`titleBarOverlay`, 32 px). The page draws the rest (`components/shell/title-bar.tsx`): a drag strip with a ☰ button that opens the app menu, the mark and the name. It sends its colours to main whenever the skin changes, so the buttons match. CSS gets the bar's height from `env(titlebar-area-height)` as `--tb` (0 on the web and in every other window), and anything sized to the window uses `--app-h` instead of `100svh`. Without a menu bar Electron doesn't run the menu's accelerators, so main handles the View menu's keys itself (`menu-keys.ts`).

## The dev server (`desktop:dev`)

- `next dev` listens on `127.0.0.1` only. The window loads it as `http://localhost:<port>`, because WebAuthn refuses an IP address as a passkey site (ADR-0014). There is no request guard and no CSP in this mode.
- The port is picked once and saved in `desktop.json`. It's part of the origin, and the origin owns OPFS (voices), IndexedDB (the outbox, play history), localStorage and cookies. If another program takes the port, Wanheda moves to a new one, and that local data starts fresh once.
- `next dev` gets only a short allowlist from the shell's environment (`dev-server.ts`), so nothing like `NODE_OPTIONS` or a terminal's `DATABASE_URL` leaks in. The app's settings come from the repo's own `.env` files, as with `bun run dev`. Main sets `BETTER_AUTH_URL` (and `NEXT_PUBLIC_APP_URL`) to the local origin, so the passkey `rpID` is `localhost`.

## Sign-in (T89, ADR-0016)

Preview and packaged builds sign in through the system browser, with any method the web offers (GitHub, Google or a passkey). There is no desktop OAuth app and no loopback callback.

1. The login page in the app shows **Sign in with your browser** (`window.wanheda.auth.signInWithBrowser`, bridge version 2). Main makes a nonce (32 random bytes), keeps it for 10 minutes (a newer start replaces it) and opens `<app>/desktop/sign-in?nonce=<nonce>` in the default browser (`handoff.ts`).
2. The browser signs in there as on the web (signed out, the proxy sends it to `/login`, which comes back to the page). The page shows who is signed in, **Open the Wanheda app** and **Use another account**. Nothing is minted until the click.
3. **Open the Wanheda app** is a plain link to `/api/desktop/handoff?nonce=<nonce>`. The server mints a single-use token for that user (2 minutes; only its SHA-256 is stored, in Better Auth's verification table) and answers 303 to `wanheda://auth?token=<t>&nonce=<nonce>`. A link, not a form: the CSP's `form-action 'self'` would block a form's redirect to `wanheda:`.
4. Windows starts Wanheda with the link (the running copy gets it through `second-instance`). Main reads it with its own parser (exact keys, both values 43 URL-safe characters, `MAX_LINK`) and takes it only if the nonce is the one it is waiting for and hasn't used, so a stranger's link can't sign the app into their account. Anything else is ignored and logged without its values.
5. Main loads `<app>/api/desktop/redeem?token=<t>` in the main window with the header `x-wanheda-redeem: 1`. The route refuses the token without that header (a link elsewhere can't add one, so a stranger's token can't sign a web browser in either). Better Auth spends the token and makes the app **a session of its own**, so signing out of the app leaves the browser signed in, and the reverse. The response sets the cookie in the app's cookie jar and moves on to `/`.

The two Better Auth endpoints are server-only (`lib/auth/desktop-handoff.ts`, not on the HTTP router). Better Auth's own `one-time-token` plugin wasn't used: it hands the browser's session to the app. Neither the token nor the nonce is ever logged; a failed load logs its error code only, because Electron's message names the URL.

A page that still starts GitHub or Google in the main window (an older page, say) starts the browser sign-in instead. `desktop:dev` runs `next dev` and doesn't register `wanheda://`, so the browser can't hand anything back: dev signs in with GitHub in a separate window (no preload, the app's session, GitHub's sign-in pages only, closes when it reaches the app). Google refuses embedded windows, so Google sign-in in dev is skipped (logged); use `desktop:preview`.

## Native features (T76, V71)

- **Quick capture**: Ctrl+Shift+Space shows a small window over any app (the `/capture` page, created hidden at start). Enter sends the text to main, which hands it to the main window's page; the page saves it through the notes outbox like any note. Esc, a save or a click elsewhere hides the window and keeps the draft.
- **Palette**: Alt+Space shows the main window with the command palette open.
- Both shortcuts live in `settings.json` and can be changed or turned off in Settings → Desktop. One another app holds shows as "taken" there; two of ours can't share keys.
- **Media keys** (`MediaPlayPause`, `MediaNextTrack`, `MediaPreviousTrack`, `MediaStop`) are registered only while the page has an audible owner (V60), paused or playing, and go to that owner through `mediaSession.command()`. A reload or any full navigation of the main window releases them until the page claims them again.
- **Notifications**: new notification-centre rows (a timer done, money and income alerts) go to main, which shows them only while the main window is hidden, minimised or unfocused. Clicking one opens its page. The log records only the kind.
- **Floating island** (V70, T77): a transparent window at the top centre of the main window's display, shown while the main window is hidden, minimised or unfocused and there's something live. The main window's page publishes a snapshot (music, read-aloud, transfers, alerts; `lib/island/snapshot.ts`), at most 4 times a second; timers reach the island through the shared activity store, like a second tab. Main checks the snapshot (`island.ts`) and hands it to the island window, whose buttons come back as commands (music, speech, dismiss, open). The window ignores the mouse except while main's 30 Hz cursor check finds the cursor over the island's rectangle (reported by the island page). Meanwhile the page's own island steps aside. You can drag it left or right along the top of the screen: its page follows the pointer and tells main how far it has gone (`wanheda:island-drag`), main moves the window inside the display's work area, never up or down, and keeps the place in `settings.json` (`islandOffset`, px from centre).
- **Settings → Desktop** (desktop only): keep running and the shortcuts. The floating island's switch is in **Settings → Island**, under "Show the island", which turns the island off altogether on this device (web too). In an unpackaged build main writes the island's window events to `main.log` (shown, hidden, pointer over or left, drag begins and ends).

## Native folders (T78, V72)

- Music and video folders are picked in the shell's own dialog (`files.pick`). Main keeps them in `roots.json` with a 128-bit random id each; the page only ever gets the id, the name and the path to show.
- The page reads files only through `wanheda-file://<root id>/<path>` (`files.ts`, `files-io.ts`). Main answers GET and HEAD with one byte range at most (so video seeks) and CORS for the app origin only; another origin gets a 404. Every request's real path (symlinks and junctions resolved) must be a plain file inside the root's real path, and a UNC path only counts when the root is one.
- The music scan lists the folder through main and reads each song through its URL; a listing that missed something (an unreadable folder, a drive gone) prunes nothing. Videos are fingerprinted from two ranges and played straight from the URL; where each one is, by fp, is kept on the device.
- Each folder is watched (`fs.watch`, recursive); once changes settle for 1.5 s, the page catches its index up.

## Native speech (T79, V73)

- Read-aloud on desktop runs Piper in sherpa-onnx, in its own utility process (`speech/speech-process.ts`, bundled to `wanheda-speech.cjs`), about 13× faster than real time on the owner's laptop. Phonemes are still made in the page (a small worker with `phonemizer` and `piper-ids.ts`) and sent as code points.
- Voices aren't downloaded again: the page hands over the copy it already has in OPFS, and main keeps it only if both files match the catalog's size and sha256 (`tts-catalog.ts`, kept equal to `lib/speech/voices.ts` by a test). Main appends sherpa's 7 metadata entries to the model and writes `tokens.txt` (`tts-model.ts`), in `userData/voices/<id>/`.
- Any failure other than a stop switches that session back to WASM Piper, so speech never goes silent. The process starts on first use, stops after 3 minutes idle, and logs units, audio time, synth time and the real-time factor when it stops.
- Installed: `resources/speech/` holds the bundle and the two sherpa packages, outside the asar; `scripts/verify.ts` allows only sherpa's five native files there.

## Native transcode (T80, V74)

- A video whose sound the browser can't decode (Dolby Digital, Dolby Digital Plus, DTS) plays through the bundled ffmpeg: the picture is copied, the sound becomes stereo AAC, and nothing is written to disk. On the web the same file still says why it can't play.
- `ffmpeg-pin.ts` pins BtbN's LGPL build: the zip, and the size and sha256 of the two files that ship (`ffmpeg.exe` and its licence text, in `resources/media/`). `scripts/fetch-ffmpeg.ts` reads just those two entries out of the release zip with Range requests into `desktop/.ffmpeg/` (ignored), and carries on after a dropped connection. `--full` downloads the whole zip (169 MB) and checks its sha256 as well. Staging and `desktop:build` check the pin again.
- The page asks main which codecs the build converts (`media.transcodable`), and the playback ladder plans with that. The media worker then fetches `wanheda-transcode://<folder id>/<path>?v=<n>&a=<n>&ss=<seconds>` and appends the stream to the same MSE buffer a remux uses, so buffering and seeking work the same way. A seek past the buffer starts a new ffmpeg at the keyframe.
- Main builds ffmpeg's arguments from one fixed template (`transcode.ts`). The page only chooses which video track, which audio track and where to start. The path goes through the native folders' checks (V72). ffmpeg runs without a shell, with only `SystemRoot` in its environment, limited to the `file` protocol. It's killed when the worker stops reading, when the window navigates and when Wanheda quits. At most two run at once.
- A file opened from outside the native folders is converted through a grant that lasts until Wanheda closes: the preload reads the path from the File object itself, so page script can never name one.
- `desktop:dev` and `desktop:preview` use the same pinned build. If it's missing (setup not run), nothing is converted and the file says why it can't play; staging and `desktop:build` stop instead.
- This ffmpeg is LGPL version 3 and runs as its own program, unmodified. Its source is FFmpeg `n9.0.2-39-g7adfbe40dc`, built by [BtbN/FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds) (release `autobuild-2026-10-31-12-59`).

## Security model (V67)

- Every window is sandboxed and context-isolated, with no Node.js and no webviews. DevTools are off in the installed app.
- The preload exposes one object, `window.wanheda`, in the main window and the quick-capture window. Every handler in main first checks the sender (that window's own top frame, on the app's origin), then parses the payload, and drops the whole payload if anything is off. Channel names and parsers are in `bridge.ts`, and the page's types are in `lib/platform/desktop.ts`.
- Links to the app's own origin stay in the app. http(s) links open in your browser. Everything else is dropped (`policy.ts`). Only the main frame's navigations and redirects are judged: embeds and the frames inside them are held by the CSP's `frame-src`, so a third-party frame can never open your browser. The main frame never becomes a `blob:` page (it would get the preload); blob links open in a child window or download.
- `wanheda://open/<page>?<query>` opens an allowlisted page with checked query keys (`links.ts`, `bridge.ts`). Installed and preview builds claim the scheme at every start. Uninstalling removes it.
- Permissions are clipboard write, full screen and folder access, for the app's origin only. Full screen is judged by the window's page, so an embed's own full-screen button works.
- The CSP comes from one builder, `lib/security/csp.ts`. `next.config.ts` sends it on every production response, so the web and the desktop get the same policy. It has no `unsafe-eval`; `wasm-unsafe-eval` is there for ONNX speech and pdf.js.
- Fuses: `runAsNode`, `NODE_OPTIONS` and `--inspect` are off. Cookie encryption, asar integrity and app-only-from-asar are on. `wasmTrapHandlers` stays on, and `scripts/build.ts` checks every fuse after packaging.

## Where data lives

The installed app keeps its data in `%APPDATA%\Wanheda`: `settings.json`, `window-state.json`, `roots.json` (the native folders), `voices/`, `logs/main.log` and Chromium's profile. Dev also keeps `desktop.json` (its port) and `logs/server.log`. Dev and preview use `Wanheda Dev` and `Wanheda Preview`, each with its own app ID, so the taskbar icons don't mix.
