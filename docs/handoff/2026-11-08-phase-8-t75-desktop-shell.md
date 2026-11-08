# Hand-off — Phase 8: Desktop — T75 desktop shell

| | |
|---|---|
| Date | 2026-11-08 |
| Phase / checkpoint | P8 CP2: T75 desktop shell built and checked on the owner's machine; T75 ticked |
| Branch | `phase-8/desktop-shell` (off `main` at `2edc4fa`), Reviewer LGTM, committed for a PR |
| HEAD at start | `2edc4fa` — Merge pull request #78 from kleenpulse/phase-8/desktop-spike |
| Previous hand-off | docs/handoff/2026-11-08-phase-8-t74-spike.md |

## State in one paragraph
T75 is built. `desktop/` is Raven's shell ported without mail, PGlite and updates. Electron 45.2.0 runs the Next standalone server in a utility process on 127.0.0.1, and the window loads it as `http://localhost:<saved port>`. Every request needs the exact Host and a per-launch token. On first run the app asks for a `.env` file, which it seals with safeStorage, or demo mode. GitHub sign-in opens in an auth window with no preload. `wanheda://` links open allowlisted pages. The CSP now has one builder (`lib/security/csp.ts`), and `next.config.ts` sends it on every production response, web included. The installer builds (127.7 MB). The installed app opens in demo mode and with the owner's env, and uninstalls cleanly. Reviewer wanheda-87 gave a FIX (subframe redirects), now fixed, then LGTM.

## Done this session
- Verified on start:
  - `main` = `origin/main` = `2edc4fa`, nothing incoming;
  - tripwire clean, typecheck clean, tests 1501 passed;
  - `git tidy` ran.
- **Owner decisions:**
  - Pin Electron **45.2.0** (the cached zip) instead of 45.2.1, so nothing is downloaded on the metered link.
  - Fetch the small NSIS toolsets for the installer check.
- `desktop/`:
  - main, preload, bridge, env, env-file, secrets, sealer, ports, policy, links, settings, window-state, lifecycle, tray, log, shared, `server/{bootstrap,guard}`;
  - scripts: `fetch-electron`, `electron-checksums`, `bundle`, `stage`, `verify`, `smoke`, `build`, `dev`, plus `bun.d.ts`;
  - `electron-builder.yml`, `build/{installer.nsh,icon.png,tray.png,tray@2x.png}`, `package.json`, `bun.lock`, `bunfig.toml`, `tsconfig.json`, `README.md`;
  - 12 test files.
- **Web side:**
  - `lib/security/csp.ts` (+ test) and `next.config.ts` `headers()`;
  - `lib/platform/desktop.ts` (+ test);
  - `components/shell/desktop-open.tsx`, mounted in `shell-frame.tsx`.
- **Root:**
  - `desktop:*` scripts;
  - CI `desktop:typecheck` (with the desktop install, `--ignore-scripts`);
  - `tsconfig` excludes `desktop/`; Vitest ignores `**/node_modules/**` and the desktop output folders; ESLint ignores the desktop output folders;
  - `.gitignore` covers the desktop output folders.
- SPEC: T75 ticked, with what was built and checked. V67 and V76 amended. ADR-0014 got an "Amendments / T75" section.
- LATEST.md: the T74 line no longer says "uncommitted" (#77 and #78 merged at `2edc4fa`).

## Verification (actual results)
- `bun run typecheck` and `bun run desktop:typecheck` pass. ESLint on every new or changed file reports 0 problems.
- `bun run test`: 159 files, 1586 passed (1593 after the review fixes).
- `bun run tripwire`: clean. `bun install --cwd desktop --frozen-lockfile --ignore-scripts`: no changes.
- `bun run desktop:stage`: 69 MB, 2,818 files, 0 links.
- `desktop:smoke`: 6/6. The app's request gets 200 and the exact CSP. No token, a wrong token, a foreign Host and `127.0.0.1:<port>` each get 403.
- **Preview** (Electron, debug port, scripted with CDP and Win32 messages; keys were only ever sent after checking the foreground window was Wanheda's):
  - first-run dialog → demo mode;
  - all 7 shell pages render with 0 console errors and 0 CSP violations;
  - the YouTube embed and i.ytimg thumbnails load, and a direct https video reaches readyState 4;
  - wasm compiles, a string `setTimeout` (eval) is blocked, and a fetch to another site is blocked;
  - a `wanheda://open/settings?s=appearance` link in a second instance navigates on the client, with no reload; `wanheda://open/api/auth/sign-out` is dropped;
  - closing hides the window (a video kept playing) and a relaunch shows it again; quitting stops the server and leaves no process;
  - importing the owner's `.env.local` takes 7 names and leaves out 3. `secrets.json` holds no plain text, and the logs hold no values. The app is gated (`/login`);
  - "Continue with GitHub" opens the auth window with `redirect_uri=http://localhost:<port>/api/auth/callback/github`, and `window.wanheda` is undefined there;
  - with the Neon host unreachable, the server starts, and `/login` and a fake-session `/` end on `/login` with no crash.
- **Installer** (`desktop:build`): all 9 fuses as configured, server folder verified, `SHA256SUMS.txt` written, 127.7 MB.
  - It installs per-user. `--remote-debugging-port` makes it exit 1.
  - It opens in demo mode and with the owner's env (gated `/login`).
  - First start takes 10 s to server ready (file scan); later starts take 1.4 s.
  - It was then uninstalled: the program folder and `HKCU\Software\Classes\wanheda` are gone, and `%APPDATA%\Wanheda` was deleted by hand.

## In progress / not finished
- Nothing half-done.

## Decisions made
- CSP from `next.config.ts` for web and desktop alike, so main adds no copy (V67 amended, ADR-0014 amendments).
- Electron 45.2.0 (owner). `electronDist` = the fetched Electron (V76 amended).
- The bootstrap is `wanheda-server.cjs`: the root has `"type": "module"`.
- sharp ships; it's the one native binary allowed (`next/image`).
- The desktop `next build` sets every `.env.example` name to `""`, so the build is demo mode.
- An empty sealed record means demo was chosen, and first run doesn't ask again. File → Import / Use demo mode restart the server on the same port.
- With no keychain, the values last for that run only and are never saved in plain text.
- Dialogs attach to the main window while it is visible. First run waits up to 3 s for the splash to show.

## Review (wanheda-87): FIX, then fixed
- **FIX:** `will-redirect` also fires for subframes, so a 302 inside an embed (or a frame nested in one) opened the system browser with no user gesture. Fixed: `navigationStep()` in `policy.ts` judges only the main frame; subframes stay under the CSP's `frame-src`. Unit tests cover a subframe redirect (allowed, never external) next to the same main-frame redirect (external).
- **Nit 1:** fullscreen is now judged by the window's page (`permissionAllowed()`), so an embed's own button works. In preview, the YouTube embed's `requestFullscreen` was granted, and the page's `fullscreenElement` was the iframe.
- **Nit 2:** first run asks again after a cancelled picker or an unusable file. In preview, cancelling the picker brought the question back with no `secrets.json` written.
- **Nit 3:** the main frame may not navigate to a `blob:` URL (the page would get the preload). In preview, `location.href = blob:` stayed on the app page, and a blob `<a download>` still downloaded.
- After the fixes: tripwire clean, both typechecks clean, ESLint 0, tests 159 files / 1593 passed.

## Bugs found (all fixed in this diff, no §B entry: caught before commit)
- The standalone `package.json` (`type: module`) made a `.js` CJS bootstrap fail. Fixed: `.cjs`.
- The first-run dialog opened behind the window. Fixed: parented, and it waits for show.
- The Edit/Write tools turn a typed `\uFEFF` escape into a raw BOM. The parser now uses `charCodeAt(0) === 0xfeff`, and a sweep found no other invisible characters.

## Known problems and risks
- **Not checked:** signed-in pages with Neon down, and a full GitHub sign-in. Both need desktop sign-in, which needs the "Wanheda Desktop" GitHub OAuth app (owner action). Passkeys made on the web don't work on desktop.
- **Installer size:** 127.7 MB, not the ADR's ~102 MB. The payload is a differential-aware 7z (good for updates on a metered link); `compression: maximum` makes no difference.
- **Leftovers on the owner's machine:**
  - `%APPDATA%\Wanheda Preview` holds profile and cache data only, no keys;
  - preview registered `wanheda://` in HKCU, but the uninstall removed that key.
- The menu bar is auto-hidden. Alt shows it (not testable with synthetic keys).
- `desktop:dev` was not run, because the owner's `next dev` holds the project lock.
- **Still open:** T44 (Phase 4 exit), 7c (unplugged drive).

## Next steps (in order)
1. Merge the T75 PR (the owner's standing go-ahead), then the Reviewer's push and main checks.
2. Owner action: create the "Wanheda Desktop" GitHub OAuth app, callback `http://localhost:<port>/api/auth/callback/github`. The port is in `%APPDATA%\Wanheda\desktop.json` after the first start.
3. T76 (desktop native) in a fresh session.

## Files to read first
- desktop/README.md, desktop/main.ts, desktop/bridge.ts, desktop/policy.ts, desktop/secrets.ts, desktop/server/bootstrap.ts
- lib/security/csp.ts, next.config.ts
- SPEC §V V67–V76, §T T76

## Env / services touched
- No new env vars. Network: `SHASUMS256.txt` (a few KB), the electron-builder NSIS toolsets (small), and Hugging Face/YouTube/Wikimedia/GitHub pages during the checks. No Neon writes (gated sign-in page only).

## Review state
- Branch / PR: `phase-8/desktop-shell` / opened after LGTM.
- Checkpoint 1 (diff): FIX from wanheda-87 (subframe redirects), fixed along with its 3 nits; re-review LGTM.
- The owner (before sleeping, 2026-11-09): on the Reviewer's LGTM, commit, push, PR, merge, then the next task.

### Reviewer prompt (T75)

```text
You are the REVIEWER for Wanheda (D:\Vxrcel\wanheda). Use the diff-reviewer skill; read-only, one pass.
Review the uncommitted diff on phase-8/desktop-shell (T75 desktop shell). Read docs/handoff/LATEST.md → 2026-11-08-phase-8-t75-desktop-shell.md,
ADR-0014 (Amendments), SPEC V67–V69, V76, desktop/README.md. Bugs and edge cases only; verdict LGTM / LGTM with nits / FIX, sent to the Builder (wanheda-7a).
Weigh hardest: preload surface, IPC sender checks, URL + auth-window policy, CSP (now sent to the web too), guard/token, .env import + sealing, deep links, fetch-electron checksums, electron-builder.yml, package.json scripts.
```

### Builder prompt (T76)

```text
You are the BUILDER for Wanheda (D:\Vxrcel\wanheda), lean mode, no worktrees. Check the branch first: the checkout may be shared.
Start: git switch main, fetch + incoming-commit check, pull, tripwire, typecheck, tests, git tidy, bun run desktop:setup.
Read docs/handoff/LATEST.md → 2026-11-08-phase-8-t75-desktop-shell.md, desktop/README.md, SPEC T76 and V60, V67, V71.
Do T76 (desktop native) on phase-8/desktop-native. The owner's link is metered: no big downloads without asking.
```
