# Latest hand-off

**Newest:** [2026-11-09-phase-8-t76-desktop-native.md](2026-11-09-phase-8-t76-desktop-native.md). **T76 (desktop native) built and checked in preview: quick capture (Ctrl+Shift+Space), palette (Alt+Space), media keys held only while something can play, Windows notifications for timer/money/income notices in the background, Settings → Desktop. T76 ticked, V71 amended. Reviewer wanheda-87: FIX (quick capture around sign-in) fixed, then LGTM; PR from `phase-8/desktop-native`, merged on the owner's standing go-ahead. Island toggle moved to T77.**

**Before it:** [2026-11-08-phase-8-t75-desktop-shell.md](2026-11-08-phase-8-t75-desktop-shell.md). T75 desktop shell merged as PR #80 at `63ce939` (Reviewer wanheda-87: FIX fixed, LGTM, push and main checks passed). Owner action still open: the "Wanheda Desktop" GitHub OAuth app.

**Earlier:** [2026-11-08-phase-8-t74-spike.md](2026-11-08-phase-8-t74-spike.md) (T74 spike, ADR-0014, PR #78), [2026-11-08-phase-8-plan.md](2026-11-08-phase-8-plan.md) (Phase 8 planned, V67–V76, T74–T83), [2026-11-08-phase-7-done.md](2026-11-08-phase-7-done.md) (Phase 7 done, v0.7.0).

- After each merge: `git tidy` (local alias).
- The checkout may be shared with another session: check the branch before staging.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests).

### Builder prompt (T77)

```text
You are the BUILDER for Wanheda (D:\Vxrcel\wanheda), lean mode, no worktrees. Check the branch first: the checkout may be shared.
Start: git switch main, fetch + incoming-commit check, pull, tripwire, typecheck, tests, git tidy, bun run desktop:setup.
Read docs/handoff/LATEST.md → 2026-11-09-phase-8-t76-desktop-native.md, desktop/README.md, ADR-0014 (island findings), SPEC T77 and V20, V61, V67, V70.
Do T77 (desktop island) on phase-8/desktop-island, including the Settings → Desktop island toggle moved from T76. The owner's link is metered: no big downloads without asking.
```
