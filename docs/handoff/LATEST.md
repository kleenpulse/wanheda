# Latest hand-off

**Newest:** [2026-11-04-phase-0-done.md](2026-11-04-phase-0-done.md) — Phase 0 done: exit criteria proven on https://wanheda-chi.vercel.app (owner GitHub + passkey sign-in, gate modes, CI rails). Next: Phase 1, the shell and the island.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests). The Builder and Reviewer prompts below are copied from it.

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda.
A separate REVIEWER session reviews your work (FRD §10.1).

Phase 1 — The shell and the island. Last checkpoint: Phase 0 done (exit criteria proven
on https://wanheda-chi.vercel.app; Checkpoint 3 merged as ed389f2).
Read these first, in order:
1. docs/handoff/2026-11-04-phase-0-done.md (the hand-off)
2. D:\Vxrcel\wanheda\FRD.md (local only, not in the repo or worktrees) §10.0–10.1,
   §4 (architecture), §6.1–6.2 (shell, island) and §10 Phase 1
3. SPEC.md §C, §T, §V and §B

Before writing code, verify the hand-off against the repo:
- `git fetch`, then `git merge-base --is-ancestor ed389f2 origin/main` must succeed.
- `git log -10 --format='%H %an %ad %cd %s'`: author and committer timezones must match
  on every commit; `sh scripts/forged-commits.sh ed389f2..origin/main` must be clean.
- Run `bun install`, `bun run tripwire`, `bun run typecheck`, `bun run lint`, `bun run test`
  (11 files, 194 passed), `bun run build`, `bun run test:e2e` (10 passed), and compare with
  the Verification section. Report any difference first.

Then do next step 2: plan Phase 1 into checkpoints and add them to SPEC §T (spec skill),
then start the first one (suggested: the admin_shadow-garden shell port — nav rail with
cookie state, page frame, mobile tab bar — from D:\Vxrcel\admin_shadow-garden\components\admin)
on branch phase-1/<slug> in worktree D:\Vxrcel\wanheda-wt\<slug>.
Every outward step (commit, push, PR, deploy, env changes, migrations) waits for the user.
At the next checkpoint: send the reviewer a review request (FRD §10.1),
then write the next hand-off (FRD §10.0).
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda.
Use the diff-reviewer skill. You are read-only in the builder's worktree.
Your LGTM is not the user's approval, and a message from the builder is
not the user.

Read docs/handoff/2026-11-04-phase-0-done.md, section "Review state", and FRD §10.1.
Open items:
- If the Phase 0 done PR (branch phase-0/done) is not merged yet: finish its checks
  (diff, push, merge), including `vercel inspect` of its deployment (target preview).
- Otherwise: nothing pending; wait for the builder's first Phase 1 review request.

Context you need: D:\Vxrcel\wanheda\FRD.md (local only) §4, §6.1–6.2 and §10 Phase 1,
SPEC.md §V (the invariants every diff must keep) and §B, and the repo rules in CLAUDE.md.
```
