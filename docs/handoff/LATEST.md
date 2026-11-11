# Latest hand-off

**Newest:** [2026-11-11-phase-8-t80-desktop-media.md](2026-11-11-phase-8-t80-desktop-media.md). **T80 (desktop media: bundled ffmpeg) is committed, reviewed (LGTM with nits) and open as PR #95 from `phase-8/desktop-media`. The pinned ffmpeg is in `desktop/.ffmpeg/` (fetched once, 55 MB by Range). Next: the owner tries an AC3 or DTS film in `desktop:preview` and merges; then T81 (desktop release).**

**Before it:** [2026-11-11-phase-8-v0.7.2.md](2026-11-11-phase-8-v0.7.2.md). v0.7.2 released (PR #93 at `7cac93b`, tag `v0.7.2` on it; installer `desktop/.out/Wanheda-0.7.2-win-x64.exe`). Still open: the owner installs 0.7.2 and tries account voices end to end.

**Earlier:** [2026-11-11-phase-8-v0.7.1.md](2026-11-11-phase-8-v0.7.1.md). v0.7.1 released (tag on `dd4a539`, the island grey-box fix). Migrations 0013 and 0014 applied.

**Earlier:** [2026-11-11-phase-8-account-voices.md](2026-11-11-phase-8-account-voices.md). T87 account voices (V83) and the note copy button, merged as PR #90 at `3077520`.

**Earlier:** [2026-11-09-phase-8-auth-swarm.md](2026-11-09-phase-8-auth-swarm.md) (T86 particle wordmark on /login) and [2026-11-09-phase-8-inlay-rail.md](2026-11-09-phase-8-inlay-rail.md) (Inlay rail wordmark, ellum-style rail), both merged together as PR #89 at `ac9c4e1`. The shadow-garden Inlay reduced-motion fix is still uncommitted in that repo (stage only that file).

**Earlier still:** [2026-11-09-phase-8-account-deletion.md](2026-11-09-phase-8-account-deletion.md). T85 account deletion, Google sign-in and the "Last used" badge, merged as PR #88 at `bbb6d2d`.

**Earlier:** [2026-11-09-phase-8-open-signup-admin.md](2026-11-09-phase-8-open-signup-admin.md) (open sign-up + admin, PR #87), [2026-11-09-phase-8-title-bar.md](2026-11-09-phase-8-title-bar.md) (title bar, PR #86), [2026-11-09-phase-8-browser-sign-in.md](2026-11-09-phase-8-browser-sign-in.md) (browser sign-in, PR #85), [2026-11-09-phase-8-t79-desktop-tts.md](2026-11-09-phase-8-t79-desktop-tts.md) (T79 native speech, PR #84), [2026-11-09-phase-8-t78-desktop-files.md](2026-11-09-phase-8-t78-desktop-files.md) (T78 native folders, PR #83), [2026-11-09-phase-8-t77-desktop-island.md](2026-11-09-phase-8-t77-desktop-island.md) (T77 island, PR #82), [2026-11-09-phase-8-t76-desktop-native.md](2026-11-09-phase-8-t76-desktop-native.md) (T76 native, PR #81), [2026-11-08-phase-8-t75-desktop-shell.md](2026-11-08-phase-8-t75-desktop-shell.md) (T75 shell, PR #80), [2026-11-08-phase-8-t74-spike.md](2026-11-08-phase-8-t74-spike.md) (T74 spike, ADR-0014, PR #78), [2026-11-08-phase-8-plan.md](2026-11-08-phase-8-plan.md) (Phase 8 planned, V67–V76, T74–T83), [2026-11-08-phase-7-done.md](2026-11-08-phase-7-done.md) (Phase 7 done, v0.7.0).

- After each merge: `git tidy` (local alias).
- The checkout may be shared with another session: check the branch before staging.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests).

### Builder prompt (T80: after the merge, T81)

```text
You are the BUILDER for Wanheda (D:\Vxrcel\wanheda), lean mode, no worktrees. Check the branch first: the checkout is shared.
Read docs/handoff/LATEST.md → 2026-11-11-phase-8-t80-desktop-media.md, and verify it (git status, tripwire, typecheck, tests).
T80 is PR #95 (phase-8/desktop-media). Another session's tooltip edits (components/, two "Changed" lines in CHANGELOG.md) may share the tree: never stage them.
If PR #95 is not merged: stop and say so, unless the owner reports an ffmpeg left in Task Manager (then fix the open nits in the hand-off's Review section).
If it is merged: git switch main, fetch + incoming-commit check, pull, git tidy, then start T81 (desktop release) on phase-8/desktop-release. Read desktop/README.md, ADR-0014 and SPEC T81, V75, V76 first.
No large downloads without asking: ffmpeg is already in desktop/.ffmpeg/.
```
