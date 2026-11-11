# Latest hand-off

**Newest:** [2026-11-11-phase-8-v0.7.2.md](2026-11-11-phase-8-v0.7.2.md). **v0.7.2 released (PR #93 at `7cac93b`, tag `v0.7.2` on it; installer `desktop/.out/Wanheda-0.7.2-win-x64.exe`, built from the release commit, so it carries #90's account voices and note copy button). Next: the owner installs 0.7.2 and tries account voices end to end; T80 (ffmpeg ≈ 126 MB) waits for the owner's yes.**

**Before it:** [2026-11-11-phase-8-v0.7.1.md](2026-11-11-phase-8-v0.7.1.md). v0.7.1 released (tag on `dd4a539`, the island grey-box fix). Migrations 0013 and 0014 applied.

**Earlier:** [2026-11-11-phase-8-account-voices.md](2026-11-11-phase-8-account-voices.md). T87 account voices (V83) and the note copy button, merged as PR #90 at `3077520`.

**Earlier:** [2026-11-09-phase-8-auth-swarm.md](2026-11-09-phase-8-auth-swarm.md) (T86 particle wordmark on /login) and [2026-11-09-phase-8-inlay-rail.md](2026-11-09-phase-8-inlay-rail.md) (Inlay rail wordmark, ellum-style rail), both merged together as PR #89 at `ac9c4e1`. The shadow-garden Inlay reduced-motion fix is still uncommitted in that repo (stage only that file).

**Earlier still:** [2026-11-09-phase-8-account-deletion.md](2026-11-09-phase-8-account-deletion.md). T85 account deletion, Google sign-in and the "Last used" badge, merged as PR #88 at `bbb6d2d`.

**Earlier:** [2026-11-09-phase-8-open-signup-admin.md](2026-11-09-phase-8-open-signup-admin.md) (open sign-up + admin, PR #87), [2026-11-09-phase-8-title-bar.md](2026-11-09-phase-8-title-bar.md) (title bar, PR #86), [2026-11-09-phase-8-browser-sign-in.md](2026-11-09-phase-8-browser-sign-in.md) (browser sign-in, PR #85), [2026-11-09-phase-8-t79-desktop-tts.md](2026-11-09-phase-8-t79-desktop-tts.md) (T79 native speech, PR #84), [2026-11-09-phase-8-t78-desktop-files.md](2026-11-09-phase-8-t78-desktop-files.md) (T78 native folders, PR #83), [2026-11-09-phase-8-t77-desktop-island.md](2026-11-09-phase-8-t77-desktop-island.md) (T77 island, PR #82), [2026-11-09-phase-8-t76-desktop-native.md](2026-11-09-phase-8-t76-desktop-native.md) (T76 native, PR #81), [2026-11-08-phase-8-t75-desktop-shell.md](2026-11-08-phase-8-t75-desktop-shell.md) (T75 shell, PR #80), [2026-11-08-phase-8-t74-spike.md](2026-11-08-phase-8-t74-spike.md) (T74 spike, ADR-0014, PR #78), [2026-11-08-phase-8-plan.md](2026-11-08-phase-8-plan.md) (Phase 8 planned, V67–V76, T74–T83), [2026-11-08-phase-7-done.md](2026-11-08-phase-7-done.md) (Phase 7 done, v0.7.0).

- After each merge: `git tidy` (local alias).
- The checkout may be shared with another session: check the branch before staging.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests).

### Builder prompt (T80) — needs the owner's yes first (ffmpeg ≈ 126 MB on a metered link)

```text
You are the BUILDER for Wanheda (D:\Vxrcel\wanheda), lean mode, no worktrees. Check the branch first: the checkout may be shared.
Start: git switch main, fetch + incoming-commit check, pull, tripwire, typecheck, tests, git tidy.
Read docs/handoff/LATEST.md → 2026-11-11-phase-8-v0.7.2.md, then desktop/README.md, ADR-0014 (ffmpeg), SPEC T80 and V52, V53.
Confirm the ffmpeg download (≈ 126 MB) with the owner before anything fetches it, then bun run desktop:setup.
Do T80 (desktop media: bundled ffmpeg) on phase-8/desktop-media.
```
