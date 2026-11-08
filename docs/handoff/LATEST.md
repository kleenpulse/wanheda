# Latest hand-off

**Newest:** [2026-11-08-phase-8-t75-desktop-shell.md](2026-11-08-phase-8-t75-desktop-shell.md). **T75 (desktop shell) built and checked on the owner's machine; T75 ticked, V67/V76 amended, ADR-0014 amendments. Electron 45.2.0 (owner: cached zip). CSP now one policy from next.config.ts for web and desktop. Installer 127.7 MB opens in demo and with the owner env, uninstalls clean. Reviewer wanheda-87: FIX (subframe redirects) fixed with 3 nits, then LGTM; committed and PR opened from `phase-8/desktop-shell`, merged on the owner's standing go-ahead. Owner action: the "Wanheda Desktop" GitHub OAuth app.**

**Before it:** [2026-11-08-phase-8-t74-spike.md](2026-11-08-phase-8-t74-spike.md). T74 spike done ⇒ ADR-0014 + pins (PR #78, merged at `2edc4fa` with the plan PR #77).

**Earlier:** [2026-11-08-phase-8-plan.md](2026-11-08-phase-8-plan.md) (Phase 8 planned, V67–V76, T74–T83), [2026-11-08-phase-7-done.md](2026-11-08-phase-7-done.md) (Phase 7 done, v0.7.0).

- After each merge: `git tidy` (local alias).
- The checkout may be shared with another session: check the branch before staging.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests).

### Builder prompt (T76)

```text
You are the BUILDER for Wanheda (D:\Vxrcel\wanheda), lean mode, no worktrees. Check the branch first: the checkout may be shared.
Start: git switch main, fetch + incoming-commit check, pull, tripwire, typecheck, tests, git tidy, bun run desktop:setup.
Read docs/handoff/LATEST.md → 2026-11-08-phase-8-t75-desktop-shell.md, desktop/README.md, SPEC T76 and V60, V67, V71.
Do T76 (desktop native) on phase-8/desktop-native. The owner's link is metered: no big downloads without asking.
```
