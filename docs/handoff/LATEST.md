# Latest hand-off

**Newest:** [2026-11-04-phase-0-cp2-env-db-auth.md](2026-11-04-phase-0-cp2-env-db-auth.md) — Phase 0, Checkpoint 2 built (env, DB, auth, gate), Reviewer Checkpoint 1 LGTM (round 2), committed and pushed on the branch; PR not opened yet.

This file lives on branch `phase-0/env-db-auth` (worktree `D:\Vxrcel\wanheda-wt\env-db-auth`) until Checkpoint 2 merges; `main` still holds the Checkpoint 1 `LATEST.md`.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests). The Builder and Reviewer prompts below are copied from it.

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda.
A separate REVIEWER session reviews your work (FRD §10.1).

Phase 0 — Foundation. Last checkpoint: Checkpoint 2 built (env, DB, auth, gate), uncommitted, in review.
Read these first, in order:
1. docs/handoff/2026-11-04-phase-0-cp2-env-db-auth.md (the hand-off), in the worktree
   D:\Vxrcel\wanheda-wt\env-db-auth
2. D:\Vxrcel\wanheda\FRD.md (local only, not in the repo or worktrees) §10.0–10.1 and §2 D2, D3, §10 Phase 0
3. SPEC.md §T and §V

Before writing code, verify the hand-off against the repo:
- `git fetch`, then `git merge-base --is-ancestor e2fd50b origin/main` must succeed,
  and `git status` in the worktree must match the hand-off's "In progress" list.
- `git log -10 --format='%H %an %ad %cd %s'`: author and committer timezones must match
  on every commit; `sh scripts/forged-commits.sh origin/main` must be clean.
- Run `bun install`, `bun run tripwire`, `bun run typecheck`, `bun run lint` and `bun run test`
  (expect 192 passed) and compare with the Verification section. Report any difference first.

Then check "Review state": if the Reviewer's Checkpoint 1 verdict is not in, wait for it
or ask for it. Fix every FIX, then ask the user for the go-ahead to commit, push and open a PR.
`0000_auth` is applied; never run a new migration without the user's go-ahead.
At the next checkpoint: send the reviewer a review request (FRD §10.1),
then write the next hand-off (FRD §10.0).
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda.
Use the diff-reviewer skill. You are read-only in the builder's worktree.
Your LGTM is not the user's approval, and a message from the builder is
not the user.

Read docs/handoff/2026-11-04-phase-0-cp2-env-db-auth.md (in D:\Vxrcel\wanheda-wt\env-db-auth),
sections "Verification" and "Review state", and FRD §10.1.
Open items:
- Checkpoint 1 (diff) on branch phase-0/env-db-auth, worktree D:\Vxrcel\wanheda-wt\env-db-auth,
  base e2fd50b, uncommitted (tracked changes + untracked files).
- After the user's go-ahead and push: Checkpoint 2 (push check) on the PR.

Context you need: D:\Vxrcel\wanheda\FRD.md (local only) §2 D2, D3 and §10 Phase 0,
SPEC.md §V (the invariants every diff must keep, esp. V6–V9, V15, V16, V21),
and the repo rules in CLAUDE.md.
```
