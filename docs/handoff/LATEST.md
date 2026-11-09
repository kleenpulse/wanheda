# Latest hand-off

**Newest:** [2026-11-09-phase-8-open-signup-admin.md](2026-11-09-phase-8-open-signup-admin.md). **Owner request (T84): anyone can sign up with a verified GitHub email; `ADMIN_EMAILS` (replaces `OWNER_EMAILS`) sees `/admin` with user counts, actives, sign-ups and app use. Review FIX (device stores per account, V78) applied; uncommitted on `phase-8/open-signup-admin`, waiting for wanheda-87's re-review. Migration `0013_user_activity` applied and `ADMIN_EMAILS` set in Vercel (owner's word); delete `OWNER_EMAILS` from Vercel only after merge.**

**Before it:** [2026-11-09-phase-8-title-bar.md](2026-11-09-phase-8-title-bar.md). Title bar like VS Code and the island grey box fix, merged as PR #86 at `c366353`.

**Earlier:** [2026-11-09-phase-8-browser-sign-in.md](2026-11-09-phase-8-browser-sign-in.md) (browser sign-in, PR #85), [2026-11-09-phase-8-t79-desktop-tts.md](2026-11-09-phase-8-t79-desktop-tts.md) (T79 native speech, PR #84), [2026-11-09-phase-8-t78-desktop-files.md](2026-11-09-phase-8-t78-desktop-files.md) (T78 native folders, PR #83), [2026-11-09-phase-8-t77-desktop-island.md](2026-11-09-phase-8-t77-desktop-island.md) (T77 island, PR #82), [2026-11-09-phase-8-t76-desktop-native.md](2026-11-09-phase-8-t76-desktop-native.md) (T76 native, PR #81), [2026-11-08-phase-8-t75-desktop-shell.md](2026-11-08-phase-8-t75-desktop-shell.md) (T75 shell, PR #80), [2026-11-08-phase-8-t74-spike.md](2026-11-08-phase-8-t74-spike.md) (T74 spike, ADR-0014, PR #78), [2026-11-08-phase-8-plan.md](2026-11-08-phase-8-plan.md) (Phase 8 planned, V67–V76, T74–T83), [2026-11-08-phase-7-done.md](2026-11-08-phase-7-done.md) (Phase 7 done, v0.7.0).

- After each merge: `git tidy` (local alias).
- The checkout may be shared with another session: check the branch before staging.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests).

### Builder prompt (T80) — needs the owner's yes first (ffmpeg ≈ 126 MB on a metered link)

```text
You are the BUILDER for Wanheda (D:\Vxrcel\wanheda), lean mode, no worktrees. Check the branch first: the checkout may be shared.
Start: git switch main, fetch + incoming-commit check, pull, tripwire, typecheck, tests, git tidy, bun run desktop:setup.
Read docs/handoff/LATEST.md → 2026-11-09-phase-8-t79-desktop-tts.md, desktop/README.md, ADR-0014 (ffmpeg), SPEC T80 and V52, V53.
Do T80 (desktop media: bundled ffmpeg) on phase-8/desktop-media. The ffmpeg download is about 126 MB: confirm with the owner before fetching it.
```
