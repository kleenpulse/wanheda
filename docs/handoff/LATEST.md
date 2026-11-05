# Latest hand-off

**Newest:** [2026-11-05-phase-2-offline.md](2026-11-05-phase-2-offline.md) — Phase 2 checkpoint 2 (T30, branch `phase-2/offline`): Dexie outbox for every note write (FIFO, one tab sends, survives a closed tab), device copy of the list, pull on focus/reconnect/30 s, conflict toast, History panel with restore, sync chip; plus all ten PR #10 review fixes (SPEC B5–B8). No migration. Open: the owner offline check in a browser, then T31 (board). T29 closed after its owner check.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests). The Builder and Reviewer prompts below are copied from it.

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04):
build features; keep tripwire, forged-commit check and CI; one typecheck + test run before a
commit; no multi-round reviews or push/merge checks; commit, push and PRs only on the user's
word; a short hand-off + continuation prompt after every PR. No worktrees: branch off main in
D:\Vxrcel\wanheda itself. One checkpoint per session: after its PR merges, stop and hand over.

Phase 2, checkpoint 3: T31 `phase-2/board`. Read docs/handoff/2026-11-05-phase-2-offline.md,
SPEC.md §T (T30, T31), §V (V15, V17, V23), the P2 CP1 and CP2 lines in §I, and ADR-0008.

Start: `git fetch`; check new commits with `sh scripts/forged-commits.sh bb929c8..origin/main`
before pulling; fast-forward main. Ask the user for the owner check of T30 (next step 2 in the
hand-off); when it passes, mark T30 `x`. Then `git switch -c phase-2/board` off main and build
T31. Board moves and resizes go through the outbox (`api.update`); the board columns already
exist, so no migration is planned. If one turns out to be needed, generate and show the SQL and
apply only on the user's go-ahead with `bun --env-file=.env.local run db:migrate`.
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only (review the PR diff with gh / git show, never switch the Builder's branch). Lean mode
(user, 2026-11-04): review only when the user asks, one pass per PR, FIX-level findings only, no
push or merge checks. Your LGTM is not the user's approval. Context:
docs/handoff/2026-11-05-phase-2-offline.md, SPEC.md §V (V7, V9, V17, V23) and §B (B5–B8). Look
hardest at lib/notes/outbox.ts #drain (rebase on the landed version, hold on failure) and
supersedes, lib/notes/local-store.ts (each step one transaction across tabs),
components/notes/notes-provider.tsx applyEvent (overlay drop vs rebase, deleted-here skip) and
lib/notes/store.ts replaceKeepingHistory.
```
