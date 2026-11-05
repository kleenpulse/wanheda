# Latest hand-off

**Newest:** [2026-11-05-phase-2-instant-nav.md](2026-11-05-phase-2-instant-nav.md) — Phase 2 checkpoint 4 (T33, branch `phase-2/instant-nav`, PR #13): shell pages await nothing (V24, CLAUDE.md goal: native-app feel), Home board in TanStack Query + `GET /api/board`, board nudges flushed on leave, Settings and Notes tab pills fixed, empty states show the Wanheda mark with pointer parallax, Notes icon `NotebookPen`. No migration. Open: owner checks of T30 and T31, then T32 (Phase 2 exit).

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests). The Builder and Reviewer prompts below are copied from it.

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04):
build features; keep tripwire, forged-commit check and CI; one typecheck + test run before a
commit; no multi-round reviews or push/merge checks; commit, push and PRs only on the user's
word; a short hand-off + continuation prompt after every PR. No worktrees: branch off main in
D:\Vxrcel\wanheda itself. One checkpoint per session: after its PR merges, stop and hand over.
House goal (CLAUDE.md): native-app feel, SPEC V24.

Phase 2 exit: T32. Read docs/handoff/2026-11-05-phase-2-instant-nav.md, SPEC.md §T (T30, T31,
T32, T33), §V (V15, V17, V23, V24) and the P2 CP1–CP4 lines in §I.

Start: `git fetch`; check new commits with `sh scripts/forged-commits.sh ed1cc03..origin/main`
before pulling; fast-forward main. Ask the user for the owner checks of T30 and T31 (next step 2
in the hand-off); mark T30, T31 and T33 `x` as each passes. Then run T32 with the user (offline
note → second device ≤ 5 s after its next sync; a conflict keeps both versions; palette finds a
body word) and write the Phase 2 done hand-off with Phase 3 prompts.
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only (review the PR diff with gh / git show, never switch the Builder's branch). Lean mode
(user, 2026-11-04): review only when the user asks, one pass per PR, FIX-level findings only, no
push or merge checks. Your LGTM is not the user's approval. Context:
docs/handoff/2026-11-05-phase-2-instant-nav.md, SPEC.md §V (V7, V17, V24). Look hardest at
components/providers/prefetch.tsx (requireOwner first; failed read never hydrates over good cache),
components/board/board.tsx (Board/BoardGrid split: key by source, setQueryData write-back vs a
background refetch or streamed hydration landing after a local edit, unmount flush), app/api/board
(503 path), and components/settings/settings-board.tsx (layout + layoutRoot on the sticky aside).
```
