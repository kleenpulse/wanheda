# Latest hand-off

**Newest:** [2026-11-05-phase-3-budgets-fx.md](2026-11-05-phase-3-budgets-fx.md). **Phase 3 CP5 (T38) built, not committed** (`phase-3/budgets-fx`, off main `e52e152`): daily FX (fawazahmed0, fetched on read) with converted headline totals and an "all in base" analytics mode; budgets with rollover, 80/100 % alerts (centre + island) and the pace-line budget level; rules on entry and import; privacy mode as dots (H, palette, top-bar eye on every page); base currency in Settings; CSV/JSON export; Home widgets (spent today, budgets, pinned billing-cycle card); "Other" → name a real category; stronger dark dock shadow. No new SQL. Vitest 58 files / 690, typecheck, tripwire, build pass; demo browser run done; owner run on Neon not done. Waiting for the user's commit word and their staging call (another session's UI edits share the tree). SPEC T37 draft applied in the tree; T38 draft in the hand-off.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests). The Builder and Reviewer prompts below are copied from it.

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04):
build features; keep tripwire, forged-commit check and CI; one typecheck + test run before a
commit; commit, push and PRs only on the user's word; a short hand-off + continuation prompt
after every PR. No worktrees: branch off main in D:\Vxrcel\wanheda itself. One checkpoint per
session: after its PR merges, stop and hand over. House goal (CLAUDE.md): native-app feel, V24.

Read docs/handoff/2026-11-05-phase-3-budgets-fx.md first. T38 was built on phase-3/budgets-fx
but NOT committed at hand-off; another session's UI edits share the tree (see "Staging"). Start:
`git fetch`; check new commits with `sh scripts/forged-commits.sh e52e152..origin/main` before
pulling. If T38 is merged, fast-forward main and, on the user's OK, apply the SPEC draft with the
spec skill. Then Phase 3 exit T39 (same statement twice ⇒ 0 rows and says so; sub due in 3 d ⇒
island + notification; month totals = hand count; recurrence from 3 months imported; all of
lib/money unit-tested; Phase 3 done hand-off with Phase 4 prompts). Never bunx a tool that is not
pinned in package.json. Any new SQL: generate, show it, apply only on the user's go-ahead.
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only. Lean mode: review when the user asks, one pass per PR, bugs and edge cases only,
verdict LGTM / LGTM with nits / FIX, sent to the Builder. Your LGTM is not the user's approval.
Target: the T38 PR (phase-3/budgets-fx): FX conversion and fetch (lib/money/fx.ts, fx-store.ts),
budgets + alerts, rules on entry and import, outbox ops (budget/rule/category), privacy masking,
export (CSV injection), Home widgets. Context: docs/handoff/2026-11-05-phase-3-budgets-fx.md,
SPEC.md V24–V32.
```
