# Latest hand-off

**Newest:** [2026-11-08-phase-8-plan.md](2026-11-08-phase-8-plan.md). **Phase 8 (Desktop, Electron) is planned: SPEC V67–V76 and T74–T83. Owner decisions: Electron stays (a full native rewrite was weighed and dropped); unsigned for now, with updates only from a hand-published draft release; the floating island shows when Wanheda is in the background; desktop secrets come from a `.env` imported once and sealed with `safeStorage`; Windows only. No code changed. Next: the owner merges `docs/phase-8-plan`, then T74 (spike) in a fresh session.**

**Before it:** [2026-11-08-phase-7-done.md](2026-11-08-phase-7-done.md). Phase 7 (Media) done, T65 ticked; v0.7.0 released (#76).

**Earlier:** [2026-11-08-phase-7-t65-sound-run.md](2026-11-08-phase-7-t65-sound-run.md), [2026-11-08-phase-7-media-home-built.md](2026-11-08-phase-7-media-home-built.md) (T73, #66), [2026-11-08-phase-7-media-player-built.md](2026-11-08-phase-7-media-player-built.md) (T72, #65).

- After each merge: `git tidy` (local alias).
- The checkout may be shared with another session: check the branch before staging.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests).

### Builder prompt (T74)

```text
You are the BUILDER for Wanheda (D:\Vxrcel\wanheda), lean mode, no worktrees. Check the branch first: the checkout may be shared.
Start: git switch main, fetch + incoming-commit check, pull, tripwire, typecheck, tests, git tidy.
Read docs/handoff/LATEST.md → 2026-11-08-phase-8-plan.md, then SPEC T74 and V67–V76.
Do T74 (Eta spike) in a scratch dir outside the repo: supply-chain read + exact pins ≥ 7 d for every package and binary,
then the measurements (a)–(f). Nothing installed into the repo. Output: ADR-0014 + pins, then a hand-off.
```

### Reviewer prompt (Phase 8)

```text
You are the REVIEWER for Wanheda (D:\Vxrcel\wanheda). Use the diff-reviewer skill; read-only.
One pass per PR, bugs and edge cases only, verdict LGTM / LGTM with nits / FIX, sent to the Builder.
Read docs/handoff/LATEST.md → 2026-11-08-phase-8-plan.md and SPEC V67–V76. Wait for the Builder's request.
Weigh hardest: preload bridge surface, IPC sender + input checks, CSP, URL policy, deep links, safeStorage secrets,
server token/Host guard, update source, bundled binaries, and boot-time configs against the worm rules in CLAUDE.md.
```
