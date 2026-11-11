# Hand-off — Phase 8: T88, the desktop shell on the hosted origin

## State in one paragraph

T88 is built on `phase-8/desktop-hosted` (stacked on `phase-8/desktop-hosted-adr`, PR #101, docs only) and **not committed**. Preview and packaged builds now load `WANHEDA_APP_URL` (baked in at bundle time, production by default) instead of starting the local server: no `.env` question, no token routing, no File-menu key items, and Settings → Desktop hides "Your keys". A failed main-frame load shows main's own "Can't reach Wanheda" page with Retry. The bridge has `version` 1. `desktop:dev` is unchanged. Earlier this session: `v0.7.4` was tagged on `52c2c3f` and pushed (owner's word), ADR-0016 + SPEC T88–T91 went up as PR #101.

## Done this session

- Verified the previous hand-off: incoming commits clean (+0100, `forged-commits.sh` clean), tripwire, typecheck, 1842 tests.
- `v0.7.4` tagged and pushed. PR #101: ADR-0016, SPEC T88–T91, amendments to V67, V68, V69, V75 and V76.
- T88 (uncommitted, my files only):
  - new `desktop/origin.ts` + `origin.test.ts` (`parseAppOrigin`, `unreachableRetry`, `unreachablePage`)
  - new `desktop/scripts/bundle.test.ts`; `scripts/bundle.ts` `appUrl()` + `define`
  - `desktop/main.ts` (hosted mode), `policy.ts` + test (https app origin), `bridge.ts` (`BRIDGE_VERSION`, `secrets` nullable), `preload.ts` (`version`)
  - `lib/platform/desktop.ts` (types), `components/settings/desktop-section.tsx` (`KeysCard` only when `secrets`)
  - `desktop/README.md` (hosted-app section), `SPEC.md` (T88 → x), this hand-off and `LATEST.md`

## Verification

- `bun run typecheck`, `bun run desktop:typecheck` clean; `bun run test` 184 files / 1853 tests pass; tripwire clean.
- Lint crashes on an untracked `brag-output-2026-11-11-164928/work/comp/timeline.js` (not this work; lint never gates). That folder should be in `.gitignore` (global rule); it isn't committed.
- Preview (`--preview --no-build`, CDP on 9222): all three windows on `https://wanheda-chi.vercel.app` (signed out ⇒ `/login`), no server started (`main.log`: `loading https://…`), `wanheda.version` = 1, `settings.get()` passed the sender check with `secrets: null`; offline reload ⇒ "Can't reach Wanheda" (`-106` logged), back online + Retry ⇒ `/login`.

## In progress / not finished

- **Not committed.** Stage only the files above. **The shared checkout has another session's work**: `CHANGELOG.md` (a "Fixed" dock line), `components/shell/dock.tsx`, `lib/shell/dock.ts`, `lib/shell/dock.test.ts`. Never stage those.
- **CHANGELOG entry not written yet** (held back so the other session can't sweep it into its commit). At commit time add under `## [Unreleased]` → `### Changed`: "The desktop app now opens your Wanheda account from the web: no .env file to import, and new web features reach it without a new installer. If it can't reach Wanheda, it says so and offers Retry." Stage just that hunk with `git apply --cached` on a one-hunk patch.

## Decisions made

- GitHub sign-in in hosted mode uses the existing in-app auth window until T89 (the loopback relay needs a local server). Google sign-in in hosted mode is logged and does nothing until T89.
- No page helper for `bridge.version` yet: nothing on the page is newer than the shell. The type documents it; features are detected per member (`state.secrets ?`).
- `desktop:preview` still stages the server (T90 removes it); `--no-build` reuses the last build.

## Known problems and risks

- Signed-in pages and the native features (folders, speech, ffmpeg, island) on the hosted origin are **not yet checked**: that needs a sign-in in preview (GitHub auth window) or T89.
- Per-origin data (OPFS voices, outbox, localStorage) starts fresh once on the move off localhost.
- Don't release a desktop build from T88 alone: Google sign-in doesn't work there until T89.

## Next steps (in order)

1. Owner: review/merge PR #101; give the word to commit T88 (with the CHANGELOG hunk), push and open its PR (base `phase-8/desktop-hosted-adr`, or `main` after #101 merges).
2. Owner (optional): sign in with GitHub in `desktop:preview` and try a native folder and read-aloud on the hosted origin.
3. T89: the sign-in handoff (`one-time-token`, `/desktop/sign-in`, `/api/desktop/redeem`, `wanheda://auth` + nonce), then remove the loopback relay.

## Files to read first

- `docs/adr/0016-desktop-loads-hosted-app.md`, SPEC T88–T91 and the 2026-11-11 amendments to V67/V68/V76
- `desktop/origin.ts`, `desktop/main.ts` (`hosted`, `start`, `did-fail-load`, `startOAuthSignIn`), `desktop/oauth.ts`, `lib/auth/server.ts`

## Env / services touched

- None. `WANHEDA_APP_URL` is a build-time, non-secret address.

## Review state

- PR #101 (docs): not reviewed. T88: not reviewed, not committed.
