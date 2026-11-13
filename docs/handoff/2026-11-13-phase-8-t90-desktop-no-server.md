# Hand-off — Phase 8: T90 — the installer ships no server

| | |
|---|---|
| Date | 2026-11-13 |
| Phase / checkpoint | Phase 8 — T90 (ADR-0016) built, not committed |
| Branch | `phase-8/desktop-no-server` (off `main` at `62f165e`) |
| HEAD | `62f165e5bcd4b5601fba405cda43f0db2b15d5cf` — Merge pull request #103 (T90 is uncommitted on top) |
| Previous hand-off | docs/handoff/2026-11-12-phase-8-t89-merged.md |

## State in one paragraph

The installer and `desktop:preview` carry no Next server any more: staging bundles only the shell (main + preload, `WANHEDA_APP_URL` baked in), the speech process with sherpa, and the pinned ffmpeg. There is no `next build` in the desktop build. The `.env` import, sealed keys, demo mode, File menu key items, Settings → Desktop "Your keys", the per-launch token header, the request guard and the server smoke test are gone. `desktop:dev` still runs `next dev`, and now `next dev` reads the repo's own `.env` files, as `bun run dev` does. At start, every mode deletes the `secrets.json` (and `secrets.json.broken-*`) that builds up to 0.7.4 left in userData.

## Done this session

- Owner confirmed (2026-11-13): the T89 browser sign-in worked in `desktop:preview` against production. Native folder and read-aloud while signed in: not tried yet.
- T90 on `phase-8/desktop-no-server`, uncommitted:
  - Removed: `desktop/server/{bootstrap,guard}.ts` (+ test), `scripts/smoke.ts`, `env.ts`, `env-file.ts`, `secrets.ts`, `sealer.ts` (+ tests), the `desktop:smoke` script.
  - `server-process.ts` → `dev-server.ts`: `next dev` only, `devEnv()` (allowlist + PORT + local `BETTER_AUTH_URL`/`NEXT_PUBLIC_APP_URL`, no token, no sealed keys), tested in `dev-server.test.ts`. `shared.ts` lost `TOKEN_HEADER`.
  - `main.ts`: no first-run ask, import, demo mode or server restart; `routeToken` → `trackRequests` (dev only, keeps the quit drain); File menu = keep running + quit; `removeOldKeys()` at start.
  - Bridge: `wanheda:secrets`, `SecretsAction`, `parseSecretsAction` and `DesktopState.secrets` gone (shell, preload, `lib/platform/desktop.ts`); Settings → Desktop's `KeysCard` gone. No `BRIDGE_VERSION` bump: hosted shells already sent `secrets: null`, and an old shell's extra field is harmless.
  - Build: `stage.ts` (no `next build`, no server; `Stage = { app }`), `dev.ts` (preview = stage only, `--no-build` gone), `verify.ts` (speech and media only, no CLI), `build.ts` (fails if `resources/server` exists), `electron-builder.yml` (no server `extraResources`), `desktop.yml` (no smoke step; `lib/security/**` and `next.config.ts` no longer trigger it, since the CSP comes from the hosted app).
  - Docs: `desktop/README.md`, `desktop/RELEASING.md`, SPEC V68 + V69 amendments, T90 row `x`, CHANGELOG (Changed: installer ~15 MB smaller, old keys deleted).

## Verification (actual results, not intentions)

- Start of session: `main` = `origin/main` = `62f165e` (no incoming commits); tripwire clean, typecheck pass, tests pass.
- After T90: `bun run tripwire` clean; `bun run desktop:typecheck` pass; `bun run typecheck` pass; `bun run test` 184 files, 1842 tests passed; eslint on the 14 changed files: clean. (`bun run lint` on the whole repo crashes on an ignored `brag-output-2026-11-11-164928/work/comp/timeline.js`. That was there before and isn't from this change.)
- `bun run desktop:build` (local, nothing downloaded): pass. Speech and media verified, all 9 fuses as expected, `resources/` = `app.asar`, `speech`, `media` (+ Electron's `default_app.asar`, `elevate.exe`). Installer **160,213,752 B** vs v0.7.4 from CI **175,539,384 B** (−15.3 MB, −8.7 %). The install no longer carries a server of about 73 MB (`.next/standalone` 43 MB + `.next/static` 30 MB).
  - The local build wrote `desktop/.out/Wanheda-0.7.4-win-x64.exe` (+ blockmap, `SHA256SUMS.txt`). It is **not** the released 0.7.4; it is ignored and must never be uploaded.
- Real Electron, preview mode, scratch copy of the staged `main.js` (userData `Wanheda T90 Scratch`, `wanheda://` registration disabled), with planted `secrets.json` + `secrets.json.broken-123` + an unrelated file: the log shows both removed, the unrelated file was kept, and it loaded `https://wanheda-chi.vercel.app`. The process was stopped and the scratch userData deleted.
- `startDevServer` + `devEnv` run directly (no window) on a free port: `next dev` read `.env.local`, ready in 7.9 s, `/login` 200, stopped cleanly.
- Not checked: `desktop:dev` with its window; an installed upgrade on the owner's machine.

## In progress / not finished

- Uncommitted on `phase-8/desktop-no-server`: everything above, plus `docs/handoff/LATEST.md`, `docs/handoff/2026-11-12-phase-8-t89-merged.md` (from the last session) and this file. They wait for the owner's go-ahead or a Reviewer LGTM.

## Decisions made

- Dev reads the repo's `.env` files instead of sealed keys (SPEC V68/V69 amended 2026-11-13). The spec listed `env*.ts` and secrets for removal, and `next dev` already loads `.env.local` itself.
- Old `secrets.json` deleted at start in every mode (V69 amendment). The only secret on the device is meant to be the session cookie, and an upgrade would otherwise leave sealed database credentials behind.
- No bridge version bump (see above).
- Request tracking stays dev-only. Tracking the hosted origin too would make every quit wait up to 2 s on any long-lived request; it wasn't needed for T90.

## Bugs found

- None.

## Known problems and risks

- `desktop:dev` now uses whatever `.env.local` holds (production Neon, if that's what it points at), the same as `bun run dev`. Before T90 the owner chose which `.env` to import.
- Desktop dev GitHub sign-in uses `.env.local`'s GitHub app, whose callback is probably the web dev port, not the desktop dev port. Passkeys (`rpID` localhost) work.
- Nit 3 from the T89 review is still open: a late `wanheda://auth` link is dropped silently while the login panel waits.

## Next steps (in order)

1. Owner go-ahead (or Reviewer LGTM) → commit on `phase-8/desktop-no-server` (stage files explicitly, hand-off docs included), push, open the PR. The PR touches `desktop/**`, so the Desktop workflow builds the installer as a check: confirm it passes without the smoke step.
2. After merge: `git tidy`, a new hand-off, and the next session.
3. Owner, sometime: in `desktop:preview` while signed in, try a native folder and read-aloud.
4. T91: a service worker for offline cold start.
5. Still open: the real Neon account-deletion test (`2026-11-09-phase-8-account-deletion.md`).

## Files to read first

- SPEC.md §T T90–T91, §V V68, V69, V75
- docs/adr/0016-desktop-loads-hosted-app.md
- desktop/main.ts, desktop/dev-server.ts, desktop/scripts/stage.ts, desktop/scripts/build.ts, .github/workflows/desktop.yml

## Env / services touched

- None. No env vars, no Vercel or Neon changes. The scratch Electron run loaded the production login page; `next dev` read `.env.local` for one `/login` request.

## Review state (two-session model, §10.1)

- Branch / PR: `phase-8/desktop-no-server` / not pushed
- Checkpoint 1 (diff): pending
- Checkpoint 2 (push): pending
- Checkpoint 3 (merge): pending
- Nits left open on purpose: T89 nit 3
