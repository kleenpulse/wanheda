# Wanheda desktop

The Windows desktop app: an Electron shell around the same Next.js server the web app runs. It is ported from Raven's `desktop/` without mail and PGlite. The decisions behind it are in [ADR-0014](../docs/adr/0014-desktop-build-and-runtime.md) and SPEC V67–V76. The version comes from the root `package.json`.

## Scripts (run from the repo root)

| Command | What it does |
| --- | --- |
| `bun run desktop:setup` | Installs this folder's packages (no install scripts run), then puts the pinned Electron in place with `scripts/fetch-electron.ts` and the pinned ffmpeg with `scripts/fetch-ffmpeg.ts` (about 55 MB, once). |
| `bun run desktop:dev` | Opens Wanheda in Electron on `next dev`, with hot reload. There's no guard and no CSP in this mode. Stop your own `next dev` first: Next.js allows only one per project. |
| `bun run desktop:preview` | Builds the production server, stages it, and opens it in Electron. Add `--no-build` (`bun desktop/scripts/dev.ts --preview --no-build`) to reuse the last build. |
| `bun run desktop:stage` | Builds and stages only (`desktop/.stage/`). |
| `bun run desktop:smoke` | Boots the staged server under Node. It checks that the app's request gets 200 and the CSP, and that a missing or wrong token, a foreign `Host` or `127.0.0.1` get 403. |
| `bun run desktop:build` | Stages, makes the NSIS installer in `desktop/.out/`, checks the server folder and Electron's fuses, and writes `SHA256SUMS.txt`. Windows only. |
| `bun run desktop:typecheck` | Type-checks this folder (CI runs it). |

Set `WANHEDA_DEBUG_PORT=9222` to open the Chrome DevTools Protocol on that port. It works in dev and preview only; the installed app refuses to start with a debugging port.

Terminals inside VS Code carry `ELECTRON_RUN_AS_NODE`. The scripts drop it, but if you run `electron.exe` yourself, unset it first, or Electron starts as plain Node.

## How it fits together

- `main.ts` is the main process. It owns the window, the session, the sealed `.env` values and the server's lifetime.
- `server/bootstrap.ts` runs Next's standalone server in an Electron utility process. It is bundled into the server folder as `wanheda-server.cjs` (`.cjs` because the root `package.json`, copied into standalone, says `"type": "module"`). It never writes into its own folder.
- `scripts/stage.ts` builds the web app with every name in `.env.example` set to empty. Next still reads `.env.local`, but it only fills names that are unset, so the build stays in demo mode. The owner's values reach the server at runtime only. Staging then copies `.next/standalone` through Turbopack's junctions, and `scripts/verify.ts` checks the result: no links, no `.env`, no tests, and no native binary except sharp for `next/image`.
- Every Bun bundle goes into an ignored folder (`.dev`, `.stage`, `.out`), so no `.js` file is ever tracked (V1).
- **Title bar (V67), like VS Code's.** The main window has no Windows title bar (`titleBarStyle: "hidden"`); Windows draws only its caption buttons (`titleBarOverlay`, 32 px). The page draws the rest (`components/shell/title-bar.tsx`): a drag strip with a ☰ button that opens the app menu, the mark and the name. It sends its colours to main whenever the skin changes, so the buttons match. CSS gets the bar's height from `env(titlebar-area-height)` as `--tb` (0 on the web and in every other window), and anything sized to the window uses `--app-h` instead of `100svh`. Without a menu bar Electron doesn't run the menu's accelerators, so main handles the View menu's keys itself (`menu-keys.ts`).

## The local server

- It listens on `127.0.0.1` only. The window loads it as `http://localhost:<port>`, because WebAuthn refuses an IP address as a passkey site (ADR-0014).
- Every request must name it exactly (`Host: localhost:<port>`, and not `127.0.0.1:<port>`). It must also carry a token that's new on each launch. Main adds the token to the app's own requests (`session.webRequest`), and page script never sees it (V68).
- The port is picked once and saved in `desktop.json`. It's part of the origin, and the origin owns OPFS (voices), IndexedDB (the outbox, play history), localStorage and cookies. If another program takes the port, Wanheda moves to a new one, and that local data starts fresh once.
- Main sets `BETTER_AUTH_URL` (and `NEXT_PUBLIC_APP_URL`) to the local origin on each launch, so the passkey `rpID` is `localhost`. Passkeys made on the web don't work here: sign in once, then add a desktop passkey in Settings.

## Your keys (V69)

- On first run, Wanheda asks for your `.env` file, or offers demo mode. Cancelling the file picker, or picking a file it can't use, asks again; only "Start in demo mode" records demo mode. It reads only the names in `.env.example`, except the two URLs above, which the app sets itself. It seals them with Windows' keychain (`safeStorage`) into `secrets.json`. It never keeps or copies the file, never writes the values in plain text, never sends them to a page, and never logs them.
- **File → Import .env file…** replaces them, and **File → Use demo mode…** forgets them. Both restart the server on the same port.
- If the keychain changed or can't open the file, Wanheda asks Quit or Start fresh. The old file stays next to the new one as `secrets.json.broken-<time>`.

## GitHub and Google sign-in

Desktop sign-in needs its own GitHub OAuth app ("Wanheda Desktop", an owner action), with callback `http://localhost:<saved port>/api/auth/callback/github`. Put its id and secret in the `.env` file you import. Google is optional: add `http://localhost:<saved port>/api/auth/callback/google` as a redirect URI on a Google Web client, and put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the same file.

Both work the same way below; GitHub is named for short. Main knows each provider's authorize page and callback, and a pending sign-in only accepts the callback of the provider it started.

Sign-in happens in the default browser, the way VS Code and `gh` do it (`oauth.ts`):

1. The app's window starts it, so Better Auth's signed state cookie lands in the app's session. Main opens GitHub's authorize page in the browser instead of letting the window go there. It remembers that sign-in's `state` only if GitHub will send it back to this app's callback, and for 10 minutes: the life of Better Auth's verification row. Better Auth's signed state cookie lapses after 5 minutes, so a slower return reaches Better Auth and gets its "try again" on the login page.
2. GitHub sends the browser back to `http://localhost:<port>/api/auth/callback/github`. That request has no token, so the server doesn't hand it to Next. It passes the query to main and moves the tab to `/desktop/signed-in`, a script-free "Back to Wanheda" page, so the code leaves the address bar. These two GETs are the only tokenless requests the server takes, and they still need the exact Host.
3. Main loads the callback in the app's window, where the state cookie and token are, and Better Auth finishes there. It does this only when the query answers the pending sign-in (same `state`, a code or an error, known parameters only). Anything else is ignored and logged, including the return of an older tab after "Open GitHub again"; its page says to start again from the app.

`desktop:dev` runs `next dev`, which has no token gate to catch the browser's return, so dev signs in in a separate window instead: no preload, the app's session, GitHub's sign-in pages only, and it closes when it reaches the app. Google refuses embedded windows, so Google sign-in in dev is skipped (logged); use `desktop:preview`.

## Native features (T76, V71)

- **Quick capture**: Ctrl+Shift+Space shows a small window over any app (the `/capture` page, created hidden at start). Enter sends the text to main, which hands it to the main window's page; the page saves it through the notes outbox like any note. Esc, a save or a click elsewhere hides the window and keeps the draft.
- **Palette**: Alt+Space shows the main window with the command palette open.
- Both shortcuts live in `settings.json` and can be changed or turned off in Settings → Desktop. One another app holds shows as "taken" there; two of ours can't share keys.
- **Media keys** (`MediaPlayPause`, `MediaNextTrack`, `MediaPreviousTrack`, `MediaStop`) are registered only while the page has an audible owner (V60), paused or playing, and go to that owner through `mediaSession.command()`. A reload or any full navigation of the main window releases them until the page claims them again.
- **Notifications**: new notification-centre rows (a timer done, money and income alerts) go to main, which shows them only while the main window is hidden, minimised or unfocused. Clicking one opens its page. The log records only the kind.
- **Floating island** (V70, T77): a transparent window at the top centre of the main window's display, shown while the main window is hidden, minimised or unfocused and there's something live. The main window's page publishes a snapshot (music, read-aloud, transfers, alerts; `lib/island/snapshot.ts`), at most 4 times a second; timers reach the island through the shared activity store, like a second tab. Main checks the snapshot (`island.ts`) and hands it to the island window, whose buttons come back as commands (music, speech, dismiss, open). The window ignores the mouse except while main's 30 Hz cursor check finds the cursor over the island's rectangle (reported by the island page). Meanwhile the page's own island steps aside.
- **Settings → Desktop** (desktop only): keep running, the floating island, the shortcuts, and importing the `.env` file again or going back to demo mode (main's own dialogs confirm).

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

The installed app keeps its data in `%APPDATA%\Wanheda`: `secrets.json`, `desktop.json` (the port), `settings.json`, `window-state.json`, `logs/` (`main.log`, `server.log`) and Chromium's profile. Dev and preview use `Wanheda Dev` and `Wanheda Preview`, each with its own app ID, so the taskbar icons don't mix.
