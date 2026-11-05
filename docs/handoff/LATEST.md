# Latest hand-off

**Newest:** [2026-11-05-phase-2-notes-core.md](2026-11-05-phase-2-notes-core.md) — Phase 2 checkpoint 1 (T29, branch `phase-2/notes-core`): notes list + Markdown editor with checklists, palette quick capture and full-text search, V23 conflict rule; `0003_notes.sql` applied to Neon. Open: the owner check in a browser, then T30 (offline outbox). Phase 1 closed in [2026-11-05-phase-1-done.md](2026-11-05-phase-1-done.md).

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests). The Builder and Reviewer prompts below are copied from it.

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04):
build features; keep tripwire, forged-commit check and CI; one typecheck + test run before a
commit; no multi-round reviews or push/merge checks; commit, push and PRs only on the user's
word; a short hand-off + continuation prompt after every PR. No worktrees: branch off main in
D:\Vxrcel\wanheda itself. One checkpoint per session: after its PR merges, stop and hand over.

Phase 2, checkpoint 2: T30 `phase-2/offline`. Read docs/handoff/2026-11-05-phase-2-notes-core.md,
SPEC.md §T (T29, T30), §V (V23) and the P2 CP1 lines in §I, and ADR-0008.

Start: `git fetch`; check new commits with `sh scripts/forged-commits.sh 50e3e9e..origin/main`
before pulling; fast-forward main. Ask the user for the owner check of T29 (next step 2 in the
hand-off); when it passes, mark T29 `x`. Then `git switch -c phase-2/offline` off main and build
T30. No migration is planned for T30; if one turns out to be needed, generate and show the SQL
and apply only on the user's go-ahead with `bun --env-file=.env.local run db:migrate`.
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only (review the PR diff with gh / git show, never switch the Builder's branch). Lean mode
(user, 2026-11-04): review only when the user asks, one pass per PR, FIX-level findings only, no
push or merge checks. Your LGTM is not the user's approval. Context:
docs/handoff/2026-11-05-phase-2-notes-core.md, SPEC.md §V (V7, V9, V17, V23). Look hardest at
lib/notes/store.ts saveNote (the version-conditional steps and the batch) and at
lib/notes/sync.ts NoteSender (rebasing a waiting write only after its predecessor landed).
```
