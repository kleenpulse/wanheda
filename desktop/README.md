# Wanheda desktop

The Windows desktop app: an Electron shell around the same Next.js server the web app runs. It is ported from Raven's `desktop/` without mail and PGlite. The decisions behind it are in [ADR-0014](../docs/adr/0014-desktop-build-and-runtime.md) and SPEC V67–V76. The version comes from the root `package.json`.

## Scripts (run from the repo root)

| Command | What it does |
| --- | --- |
| `bun run desktop:setup` | Installs this folder's packages (no install scripts run), then puts the pinned Electron in place with `scripts/fetch-electron.ts`. |
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

## The local server

- It listens on `127.0.0.1` only. The window loads it as `http://localhost:<port>`, because WebAuthn refuses an IP address as a passkey site (ADR-0014).
- Every request must name it exactly (`Host: localhost:<port>`, and not `127.0.0.1:<port>`). It must also carry a token that's new on each launch. Main adds the token to the app's own requests (`session.webRequest`), and page script never sees it (V68).
- The port is picked once and saved in `desktop.json`. It's part of the origin, and the origin owns OPFS (voices), IndexedDB (the outbox, play history), localStorage and cookies. If another program takes the port, Wanheda moves to a new one, and that local data starts fresh once.
- Main sets `BETTER_AUTH_URL` (and `NEXT_PUBLIC_APP_URL`) to the local origin on each launch, so the passkey `rpID` is `localhost`. Passkeys made on the web don't work here: sign in once, then add a desktop passkey in Settings.

## Your keys (V69)

- On first run, Wanheda asks for your `.env` file, or offers demo mode. Cancelling the file picker, or picking a file it can't use, asks again; only "Start in demo mode" records demo mode. It reads only the names in `.env.example`, except the two URLs above, which the app sets itself. It seals them with Windows' keychain (`safeStorage`) into `secrets.json`. It never keeps or copies the file, never writes the values in plain text, never sends them to a page, and never logs them.
- **File → Import .env file…** replaces them, and **File → Use demo mode…** forgets them. Both restart the server on the same port.
- If the keychain changed or can't open the file, Wanheda asks Quit or Start fresh. The old file stays next to the new one as `secrets.json.broken-<time>`.

## GitHub sign-in

Desktop sign-in needs its own GitHub OAuth app ("Wanheda Desktop", an owner action), with callback `http://localhost:<saved port>/api/auth/callback/github`. Put its id and secret in the `.env` file you import. GitHub's pages open in a separate window with no preload, sharing the app's session. That window may only visit GitHub's sign-in pages, and it closes as soon as the callback reaches the app.

## Security model (V67)

- Every window is sandboxed and context-isolated, with no Node.js and no webviews. DevTools are off in the installed app.
- The main window's preload exposes one object, `window.wanheda`, with `desktop: true` and `onOpen(callback)`. Channel names and checks are in `bridge.ts`, and the page's types are in `lib/platform/desktop.ts`.
- Links to the app's own origin stay in the app. http(s) links open in your browser. Everything else is dropped (`policy.ts`). Only the main frame's navigations and redirects are judged: embeds and the frames inside them are held by the CSP's `frame-src`, so a third-party frame can never open your browser. The main frame never becomes a `blob:` page (it would get the preload); blob links open in a child window or download.
- `wanheda://open/<page>?<query>` opens an allowlisted page with checked query keys (`links.ts`, `bridge.ts`). Installed and preview builds claim the scheme at every start. Uninstalling removes it.
- Permissions are clipboard write, full screen and folder access, for the app's origin only. Full screen is judged by the window's page, so an embed's own full-screen button works.
- The CSP comes from one builder, `lib/security/csp.ts`. `next.config.ts` sends it on every production response, so the web and the desktop get the same policy. It has no `unsafe-eval`; `wasm-unsafe-eval` is there for ONNX speech and pdf.js.
- Fuses: `runAsNode`, `NODE_OPTIONS` and `--inspect` are off. Cookie encryption, asar integrity and app-only-from-asar are on. `wasmTrapHandlers` stays on, and `scripts/build.ts` checks every fuse after packaging.

## Where data lives

The installed app keeps its data in `%APPDATA%\Wanheda`: `secrets.json`, `desktop.json` (the port), `settings.json`, `window-state.json`, `logs/` (`main.log`, `server.log`) and Chromium's profile. Dev and preview use `Wanheda Dev` and `Wanheda Preview`, each with its own app ID, so the taskbar icons don't mix.
