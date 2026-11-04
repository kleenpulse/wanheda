# Latest hand-off

**Newest:** [2026-11-04-phase-1-prefs.md](2026-11-04-phase-1-prefs.md) — Phase 1: skins (Bench), free accent colour, wallpapers and the notification centre (T27, branch `phase-1/prefs`). Migration `0002_prefs_notifications` applied to Neon. Next: T28 Phase 1 exit, in a new session.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests). The Builder and Reviewer prompts below are copied from it.

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04):
build features; keep tripwire, forged-commit check and CI; one typecheck + test run before a
commit; no multi-round reviews or push/merge checks; commit, push and PRs only on the user's
word; a short hand-off + continuation prompt after every PR. No worktrees: branch off main in
D:\Vxrcel\wanheda itself. One checkpoint per session: after its PR merges, stop and hand over.

Phase 1 — The shell and the island. Last PR: T27 prefs + notification centre (branch
phase-1/prefs). Read docs/handoff/2026-11-04-phase-1-prefs.md and SPEC.md §T (T28).

Start: `git fetch`; check new commits on origin/main with
`sh scripts/forged-commits.sh a4b0a48..origin/main` before pulling. If the prefs PR is merged,
fast-forward main, mark T27 `x`, and `git switch -c phase-1/exit`; otherwise stack on
phase-1/prefs. Confirm migration 0002_prefs_notifications is applied (ask the user if unsure).
Then T28, the Phase 1 exit: board and prefs survive a reload on another device; Ctrl+K opens
every route and command; timer palette → island → expand → survives navigation; Lighthouse
a11y ≥ 95 on Home; Phase 1 done hand-off with Phase 2 prompts.
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only (review the PR diff with gh / git show, never switch the Builder's branch). Lean mode
(user, 2026-11-04): review only when the user asks, one pass per PR, FIX-level findings only, no
push or merge checks. Your LGTM is not the user's approval. Context:
docs/handoff/2026-11-04-phase-1-prefs.md, SPEC.md §V (V15 amended for the free accent).
```
