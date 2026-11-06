# Latest hand-off

**Newest:** [2026-11-06-phase-5-start.md](2026-11-06-phase-5-start.md). **Phase 5 (Reader) SPEC draft written and decided on `phase-5/reader-core` (1 local commit, not pushed); T46 next in a fresh session.** PRs #27 (T42) and #28 (T43) merged. T44 deferred (user): the Polar org has no sales yet, so parity is ticked on the first real sale. Decided 2026-11-06: local-only first (files in OPFS per device, document rows and progress in Neon, relink by sha256; R2 later without rework), `highlight` table in 0007, sentences on device until R2, library versions pinned from recon. PR #29 (user's darker Bench `globals.css`) open for the user to merge.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests). The Builder and Reviewer prompts below are copied from it.

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04,
tightened 2026-11-05): build features; tests only where they guard real logic or a spec exit
case; keep tripwire, forged-commit check and CI; one typecheck + test run before a commit;
after the Reviewer peer's LGTM (or LGTM with nits) commit, push and open the PR without asking
(user 2026-11-05); merge and db:migrate stay the user's. A short hand-off + continuation prompt
after every PR. No worktrees. One checkpoint per session. House goal (CLAUDE.md): native-app
feel, V24.

Read docs/handoff/2026-11-06-phase-5-start.md first. You are on branch phase-5/reader-core
(one local commit: the Phase 5 SPEC draft). Build T46 per SPEC §T and V38, V39, V41:
local-only reader core (files in OPFS, document rows in Neon), schema + reviewed SQL
drizzle/0007 (document, collection, document_collection, reading_progress, highlight;
db:migrate only on the user's go-ahead), sha256 hash worker, /reader library app (manifest,
rail, palette; covers, tags, collections, progress %, last opened; open a local file;
"not on this device" relink by sha256), demo seed docs, Home "Continue reading" widget.
Install only the pinned versions in the hand-off (7-day cooldown; no bunx of unpinned tools;
no tracked .js/.mjs). Leave app/globals.css alone (PR #29 holds it).
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only. One pass, bugs and edge cases only, verdict LGTM / LGTM with nits / FIX, sent to the
Builder. Your LGTM is not the user's approval.
Target: the T46 diff on phase-5/reader-core. Riskiest: drizzle/0007 (RLS, uniques, cascades,
user scoping); sha256 identity and relink on another device; nothing about file bytes reaching
the server in local-only mode; reading_progress newer-wins by client `at` (V41); OPFS failure
paths (quota, private mode); V24 (no page skeleton on a hop); demo never touching the DB.
Context: docs/handoff/2026-11-06-phase-5-start.md.
```
