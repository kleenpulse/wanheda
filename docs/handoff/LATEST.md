# Latest hand-off

**Newest:** [2026-11-04-phase-1-palette-island.md](2026-11-04-phase-1-palette-island.md) — Phase 1: command palette + dynamic island with timers (PR #5). Next: T25 home board.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests). The Builder and Reviewer prompts below are copied from it.

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04):
build features; keep tripwire, forged-commit check and CI; one typecheck + test run before a
commit; no multi-round reviews or push/merge checks; commit, push and PRs only on the user's
word; a short hand-off + continuation prompt after every PR.

Phase 1 — The shell and the island. Last PR: #5 (palette + island, branch phase-1/palette,
worktree D:\Vxrcel\wanheda-wt\shell). Read docs/handoff/2026-11-04-phase-1-palette-island.md
and SPEC.md §T (T25–T28).

Start: `git fetch`; check any new commits on origin/main with
`sh scripts/forged-commits.sh 983eb8a..origin/main` before pulling. If PR #5 is merged, branch
phase-1/board from origin/main (new worktree D:\Vxrcel\wanheda-wt\board, `bun install`);
otherwise stack on phase-1/palette. Then build T25 (home board). Migrations: generate and show
the SQL; apply only on the user's go-ahead.
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only in the Builder's worktree. Lean mode (user, 2026-11-04): review only when the user
asks, one pass per PR, FIX-level findings only, no push or merge checks. Your LGTM is not the
user's approval. Context: docs/handoff/2026-11-04-phase-1-palette-island.md, SPEC.md §V.
```
