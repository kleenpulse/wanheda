# Hand-off — Phase 8: desktop on the hosted app — ADR-0016

## State in one paragraph

The owner decided (2026-11-11) that the desktop app should work like Raven's: no `.env` import. Wanheda's data is in one shared database behind the hosted app, so the chosen route is ADR-0016: packaged builds load `https://wanheda-chi.vercel.app` instead of running a bundled Next server, and sign-in happens in the system browser, handed back by a Better Auth one-time token on a nonce-checked `wanheda://auth` link. The ADR and the SPEC amendments (T88–T91; V67, V68, V69, V75, V76) are on `phase-8/desktop-hosted-adr` as a docs PR. No code has changed for it yet. T81's CI half (`.github/workflows/desktop.yml` + `desktop/RELEASING.md`) merged as PR #100 at `52c2c3f`, and `v0.7.4` is tagged there and pushed (owner's word, 2026-11-11), so CI drafts the release.

## Done this session

- Notes: list view fills the page; the note body scrolls in its card; × and Esc close a note opened from the Board. PR #97, merged at `cb6b794`.
- v0.7.4 cut: PR #98, merged at `d59edab`. Tagged `v0.7.4` on `52c2c3f` (after PR #100) and pushed.
- T81 (CI half): `desktop.yml` builds the Windows installer on PRs that touch the desktop, and on a `v*` tag makes a DRAFT release (checksums, tag = `package.json`, notes from `CHANGELOG.md`). Commit `5dbd7cd`, PR #100. Its own Desktop run is the first real CI build: check it.
- ADR-0016 written, with tasks T88–T91. It is listed in `docs/adr/README.md`.

## Verification

- PR #100: the YAML parses, the tripwire is clean, and the CHANGELOG notes extraction was dry-run (0.7.4 found; a missing version fails). Its own Desktop run (43106925469) passed: rails ✓, build ✓ (installer built, fuses and server checked, smoke test passed); draft release skipped, as it is for a PR.
- No app code changed for ADR-0016.

## In progress / not finished

- `phase-8/desktop-hosted-adr`: ADR-0016, the ADR index line, the SPEC amendments and this hand-off, committed and opened as a docs PR (owner's go-ahead).

## Decisions made

- ADR-0016 (owner: "go with ur recommendation"). The alternatives (bake the credentials into the installer, keep the `.env` import, PGlite) are written up and rejected there.

## Known problems and risks

- **No offline cold start** once the shell is on the hosted origin, until T91 (service worker).
- **Trust moves to the deployment:** the hosted origin gets the preload's powers. See ADR-0016, Consequences.
- `v0.7.0` exists only as a local tag; it was never pushed. Leave it until the owner says.

## Next steps (in order)

1. Owner: check the v0.7.4 Desktop run; the draft appears under Releases; publish it.
2. Owner: merge the ADR-0016 docs PR.
3. T88: shell on the hosted origin (start in `desktop/main.ts` `startServer`/`appOrigin`, `policy.ts`, `shared.ts`).
4. T89: sign-in handoff. T90: drop the server from the installer.

## Files to read first

- `docs/adr/0016-desktop-loads-hosted-app.md`, `docs/adr/0014-desktop-build-and-runtime.md`
- `desktop/README.md`, `desktop/main.ts` (`appOrigin`, `startServer`, `routeToken`), `desktop/policy.ts`, `desktop/oauth.ts`, `desktop/links.ts`
- `lib/auth/server.ts` (plugins), `lib/security/csp.ts`

## Env / services touched

- None. T88 adds the build-time `WANHEDA_APP_URL`, which is not a secret.

## Review state

- PR #100: not reviewed by a Reviewer session.
- ADR-0016: not pushed.
