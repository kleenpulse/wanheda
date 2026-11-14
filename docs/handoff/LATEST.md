# Latest hand-off

**Newest:** [2026-11-14-phase-8-notes-read-scroll.md](2026-11-14-phase-8-notes-read-scroll.md). **PR #107 merged (`main` at `84f7f08`): T81 self-updater + auto-download switch. Notes Write → Read scroll fix `795f2fd`, Reviewer LGTM, open as PR #108; tip check pending. Hosted app paused by Vercel (402 `DEPLOYMENT_DISABLED`): the owner resumes it.**

**Before it:** [2026-11-14-phase-8-t81-pr-auto-download.md](2026-11-14-phase-8-t81-pr-auto-download.md). **`phase-8/t81-updater` pushed (owner allowed it) as PR #107 (tip `1014178`). Owner chose a "Download updates automatically" switch, default off: committed as `06d56f6` after Reviewer wanheda-9e's FIX (a download kept over a quit now comes back as Restart to update), pushed; Reviewer's delta and post-push check pending. Merge only on the owner's word; then T82.**

**Earlier:** [2026-11-13-phase-8-t81-updater.md](2026-11-13-phase-8-t81-updater.md). T81 self-updater + `fix(notes)` + `style(island)` committed (3 commits off `64a78ce`), Reviewer LGTM with nits (fixed); push was denied while the owner slept. V75 settled strict (install only on Restart).

**Earlier:** [2026-11-13-phase-8-v0.7.5-released.md](2026-11-13-phase-8-v0.7.5-released.md). v0.7.5 merged (PR #106, `main` at `64a78ce`), tagged, published as Latest; built locally too; v0.7.4 draft deleted.

**Earlier:** [2026-11-13-phase-8-v0.7.5-cut.md](2026-11-13-phase-8-v0.7.5-cut.md). v0.7.5 cut on `release/v0.7.5` as PR #106.

**Earlier:** [2026-11-13-phase-8-t91-merged.md](2026-11-13-phase-8-t91-merged.md). T91 (offline service worker) + the social avatar merged as PR #105 (`main` at `e4d830b`, deployed; prod serves `/sw.js`).

**Earlier:** [2026-11-13-phase-8-t91-service-worker.md](2026-11-13-phase-8-t91-service-worker.md). T91 + avatar built on `phase-8/t91-service-worker`; offline cold start checked in a real browser against a killed server.

**Earlier:** [2026-11-13-phase-8-t90-merged.md](2026-11-13-phase-8-t90-merged.md). T90 merged as PR #104 (`main` at `f302c04`, deployed).

**Before it:** [2026-11-13-phase-8-t90-desktop-no-server.md](2026-11-13-phase-8-t90-desktop-no-server.md). **T90 built on `phase-8/desktop-no-server`, uncommitted, waiting for the owner's go-ahead (or a Reviewer LGTM): the installer ships no server (160.2 MB, was 175.5 MB), no `.env` import or keys anywhere, dev's `next dev` reads the repo's `.env` files, old `secrets.json` deleted at start. Owner confirmed the T89 browser sign-in works in `desktop:preview`.**

**Earlier:** [2026-11-12-phase-8-t89-merged.md](2026-11-12-phase-8-t89-merged.md). T89 merged as PR #103 (`main` at `62f165e`, deployed).

**Earlier:** [2026-11-12-phase-8-t89-desktop-sign-in.md](2026-11-12-phase-8-t89-desktop-sign-in.md). **T89 on `phase-8/desktop-sign-in`, Reviewer LGTM with nits (fixed), PR open for the owner: "Sign in with your browser" (nonce ⇒ `/desktop/sign-in` ⇒ single-use token ⇒ `wanheda://auth` ⇒ redeem with a header main alone sends), the app gets its own session, loopback relay removed, `bridge.version` 2. Owner confirmed 2026-11-12: `OWNER_EMAILS` removed from Vercel, Google sign-in live in production. Still open: the Neon deletion test.**

**Earlier:** [2026-11-11-phase-8-t88-desktop-hosted.md](2026-11-11-phase-8-t88-desktop-hosted.md). T88 (PR #102) and ADR-0016 (PR #101), both merged at `9f92bcc`: preview and packaged builds load the hosted app.

**Earlier:** [2026-11-11-phase-8-desktop-hosted-adr.md](2026-11-11-phase-8-desktop-hosted-adr.md). ADR-0016 + SPEC T88–T91 (PR #101); `v0.7.4` tagged on `52c2c3f` and pushed.

**Earlier:** [2026-11-11-phase-8-v0.7.3.md](2026-11-11-phase-8-v0.7.3.md). v0.7.3 released (tag on `1edc90d`). Open: a floating island that took no clicks in the owner's preview (not reproduced).

**Earlier:** [2026-11-11-phase-8-t80-desktop-media.md](2026-11-11-phase-8-t80-desktop-media.md). T80 (bundled ffmpeg for AC3, E-AC3 and DTS) and what was built on its branch: folders in Videos, the smart field, the Up Next drum, the draggable island. Merged as PR #95.

**Earlier:** [2026-11-11-phase-8-v0.7.2.md](2026-11-11-phase-8-v0.7.2.md). v0.7.2 released (PR #93 at `7cac93b`, tag `v0.7.2` on it; installer `desktop/.out/Wanheda-0.7.2-win-x64.exe`). Still open: the owner installs 0.7.2 and tries account voices end to end.

**Earlier:** [2026-11-11-phase-8-v0.7.1.md](2026-11-11-phase-8-v0.7.1.md). v0.7.1 released (tag on `dd4a539`, the island grey-box fix). Migrations 0013 and 0014 applied.

**Earlier:** [2026-11-11-phase-8-account-voices.md](2026-11-11-phase-8-account-voices.md). T87 account voices (V83) and the note copy button, merged as PR #90 at `3077520`.

**Earlier:** [2026-11-09-phase-8-auth-swarm.md](2026-11-09-phase-8-auth-swarm.md) (T86 particle wordmark on /login) and [2026-11-09-phase-8-inlay-rail.md](2026-11-09-phase-8-inlay-rail.md) (Inlay rail wordmark, ellum-style rail), both merged together as PR #89 at `ac9c4e1`. The shadow-garden Inlay reduced-motion fix is still uncommitted in that repo (stage only that file).

**Earlier still:** [2026-11-09-phase-8-account-deletion.md](2026-11-09-phase-8-account-deletion.md). T85 account deletion, Google sign-in and the "Last used" badge, merged as PR #88 at `bbb6d2d`.

**Earlier:** [2026-11-09-phase-8-open-signup-admin.md](2026-11-09-phase-8-open-signup-admin.md) (open sign-up + admin, PR #87), [2026-11-09-phase-8-title-bar.md](2026-11-09-phase-8-title-bar.md) (title bar, PR #86), [2026-11-09-phase-8-browser-sign-in.md](2026-11-09-phase-8-browser-sign-in.md) (browser sign-in, PR #85), [2026-11-09-phase-8-t79-desktop-tts.md](2026-11-09-phase-8-t79-desktop-tts.md) (T79 native speech, PR #84), [2026-11-09-phase-8-t78-desktop-files.md](2026-11-09-phase-8-t78-desktop-files.md) (T78 native folders, PR #83), [2026-11-09-phase-8-t77-desktop-island.md](2026-11-09-phase-8-t77-desktop-island.md) (T77 island, PR #82), [2026-11-09-phase-8-t76-desktop-native.md](2026-11-09-phase-8-t76-desktop-native.md) (T76 native, PR #81), [2026-11-08-phase-8-t75-desktop-shell.md](2026-11-08-phase-8-t75-desktop-shell.md) (T75 shell, PR #80), [2026-11-08-phase-8-t74-spike.md](2026-11-08-phase-8-t74-spike.md) (T74 spike, ADR-0014, PR #78), [2026-11-08-phase-8-plan.md](2026-11-08-phase-8-plan.md) (Phase 8 planned, V67–V76, T74–T83), [2026-11-08-phase-7-done.md](2026-11-08-phase-7-done.md) (Phase 7 done, v0.7.0).

- After each merge: `git tidy` (local alias).
- The checkout may be shared with another session: check the branch before staging.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests).

### Builder prompt (#107 merged, #108 open)

```text
You are the BUILDER for Wanheda (D:/Vxrcel/wanheda), lean mode, no worktrees. Check the branch first: the checkout is shared.
Read docs/handoff/LATEST.md → 2026-11-14-phase-8-notes-read-scroll.md, and verify it (git status, tripwire, both typechecks, tests).
PR #107 is merged (main 84f7f08). PR #108 (phase-8/notes-read-scroll, notes Write/Read scroll fix) waits for the Reviewer's tip check.
Merge #108 only on the owner's word, then git tidy and the Reviewer's main check.
Ask whether Vercel is resumed (402 DEPLOYMENT_DISABLED) and about Read → Write keeping its place. Then T82.
```
