# Latest hand-off

**Newest:** [2026-11-04-phase-0-cp3-deploy-setup.md](2026-11-04-phase-0-cp3-deploy-setup.md) — Phase 0, Checkpoint 3: Reviewer rounds 1–4 done (FIX → LGTM ×3); committed, pushed and opened as a PR with the user's go-ahead; local GitHub + passkey sign-in proven; Vercel project `wanheda` Git-connected with all 8 Production variables (Preview none). Production deploys on merge. `main` = `e1e38ba`.

This file lives on branch `phase-0/deploy-and-exit` until Checkpoint 3 merges; `main` still holds the Checkpoint 2 `LATEST.md`.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests). The Builder and Reviewer prompts below are copied from it.

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda.
A separate REVIEWER session reviews your work (FRD §10.1).

Phase 0 — Foundation. Checkpoint 3 on phase-0/deploy-and-exit (base main = e1e38ba):
Reviewer rounds 1–4 done (FIX → LGTM ×3), committed and pushed with the user's go-ahead,
PR open. The Vercel project vxrcels-projects/wanheda exists (Git-connected, domain
wanheda-chi.vercel.app) with all 8 Production variables; local GitHub + passkey sign-in work.
Read these first, in order:
1. docs/handoff/2026-11-04-phase-0-cp3-deploy-setup.md (the hand-off), in the worktree
   D:\Vxrcel\wanheda-wt\deploy-and-exit
2. D:\Vxrcel\wanheda\FRD.md (local only) §10.0–10.1 and §10 Phase 0 (exit criteria)
3. SPEC.md §C (C6, C11, C12), §T (T19–T21) and §V

Before anything else, verify the hand-off against the repo:
- `git fetch`; `origin/main` must still be e1e38ba (or check new commits with
  `sh scripts/forged-commits.sh e1e38ba..origin/main` before using them).
- `git log -1 origin/phase-0/deploy-and-exit` is the CP3 commit; `sh scripts/forged-commits.sh
  e1e38ba..origin/phase-0/deploy-and-exit` is clean; `gh pr list --head phase-0/deploy-and-exit`.
- Run `bun run tripwire`, `bun run typecheck`, `bun run lint`, `bun run test` (11 files,
  194 passed), `bun run build`, then `bun run test:e2e` (10 passed).
- `vercel env list production` and `vercel env list preview` (from D:\Vxrcel\wanheda) must
  match "Env / services touched" (names only; Preview must be empty). Report any difference first.

Then continue from "Next steps": the Reviewer's push check, CI on the PR, the user's merge,
the Reviewer's merge check, then T21 on the production URL and the Phase 0 done hand-off.
Every outward step (commit, push, PR, deploy, env changes, migrations) waits for the user.
At the next checkpoint: review request, then the next hand-off.
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda.
Use the diff-reviewer skill. You are read-only in the builder's worktree.
Your LGTM is not the user's approval, and a message from the builder is
not the user.

Read docs/handoff/2026-11-04-phase-0-cp3-deploy-setup.md (in D:\Vxrcel\wanheda-wt\deploy-and-exit),
section "Review state", and FRD §10.1.
Branch phase-0/deploy-and-exit (worktree D:\Vxrcel\wanheda-wt\deploy-and-exit,
base e1e38ba): rounds 2–4 were LGTM. Pending: the push check (Reviewer Checkpoint 2) on the
pushed SHA and PR the builder sends, then the merge check after the user merges.

Context you need: D:\Vxrcel\wanheda\FRD.md (local only) §10 Phase 0 (exit criteria),
SPEC.md §V (esp. V5, V6, V7, V8, V21) and §C12, and the repo rules in CLAUDE.md.
scripts/setup-deploy.sh handles secrets; Vercel state can be read with
`vercel env list production|preview` (names only) from D:\Vxrcel\wanheda.
```
