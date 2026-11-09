# Latest hand-off

**Newest:** [2026-11-09-phase-8-t77-desktop-island.md](2026-11-09-phase-8-t77-desktop-island.md). **T77 (floating island) built and checked in preview: a transparent island over other apps while Wanheda is in the background, with working buttons and click-through; the page island steps aside; Settings → Desktop island switch. T77 ticked, V70 amended. Reviewer wanheda-87: FIX ×2 (gated mode, zoom) fixed, then LGTM; PR from `phase-8/desktop-island`, merged on the owner's standing go-ahead.**

**Before it:** [2026-11-09-phase-8-t76-desktop-native.md](2026-11-09-phase-8-t76-desktop-native.md). T76 desktop native merged as PR #81 at `6ec41dc` (wanheda-87: FIX fixed, LGTM, push and main checks passed).

**Earlier:** [2026-11-08-phase-8-t75-desktop-shell.md](2026-11-08-phase-8-t75-desktop-shell.md) (T75 shell, PR #80), [2026-11-08-phase-8-t74-spike.md](2026-11-08-phase-8-t74-spike.md) (T74 spike, ADR-0014, PR #78), [2026-11-08-phase-8-plan.md](2026-11-08-phase-8-plan.md) (Phase 8 planned, V67–V76, T74–T83), [2026-11-08-phase-7-done.md](2026-11-08-phase-7-done.md) (Phase 7 done, v0.7.0).

- After each merge: `git tidy` (local alias).
- The checkout may be shared with another session: check the branch before staging.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests).

### Builder prompt (T78)

```text
You are the BUILDER for Wanheda (D:\Vxrcel\wanheda), lean mode, no worktrees. Check the branch first: the checkout may be shared.
Start: git switch main, fetch + incoming-commit check, pull, tripwire, typecheck, tests, git tidy, bun run desktop:setup.
Read docs/handoff/LATEST.md → 2026-11-09-phase-8-t77-desktop-island.md, desktop/README.md, SPEC T78 and V54, V58, V67, V72.
Do T78 (desktop files) on phase-8/desktop-files. The owner's link is metered: no big downloads without asking.
```
