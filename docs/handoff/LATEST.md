# Latest hand-off

**Newest:** [2026-11-05-phase-3-subscriptions.md](2026-11-05-phase-3-subscriptions.md). **Phase 3 CP3 subscriptions built** (T36 `x`). Branch `phase-3/subscriptions`, committed and PR opened (user go-ahead). New: a third money tab `/money/subscriptions` (monthly and yearly totals, ranked list, 60-day timeline), subscription writes through the money outbox (`sub-save`, `sub-delete`), reminders as deduped notifications raised on shell load and after a save, the island `money-alert`, and palette "New subscription". No new SQL. Owner-mode check not done. Open: intermittent React #418 hydration error on /money/subscriptions (see hand-off). Next: optional Reviewer pass, owner check (5 steps in the hand-off), merge, then T37 in a fresh session.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests). The Builder and Reviewer prompts below are copied from it.

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04):
build features; keep tripwire, forged-commit check and CI; one typecheck + test run before a
commit; commit, push and PRs only on the user's word; a short hand-off + continuation prompt
after every PR. No worktrees: branch off main in D:\Vxrcel\wanheda itself. One checkpoint per
session: after its PR merges, stop and hand over. House goal (CLAUDE.md): native-app feel, V24.

Phase 3 CP4: import (SPEC T37). Read docs/handoff/2026-11-05-phase-3-subscriptions.md, SPEC.md
T37, V12, V25, V27, V28, V32, ADR-0008, and lib/money/subscriptions.ts (recurring detection
ends in a subscription with detected_from_txn). First ask the user for redacted sample
statements from their NG and US banks; build the generic mapper first if they aren't ready.

Start: `git fetch`; check new commits with `sh scripts/forged-commits.sh c37937e..origin/main`
before pulling; fast-forward main. Then `git switch -c phase-3/import`. Any new package: pinned,
>= 7 days old, supply-chain read first. Any new SQL: generate, show it, apply only on the
user's go-ahead.
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only. Lean mode: review when the user asks, one pass per PR, bugs and edge cases only,
verdict LGTM / LGTM with nits / FIX, sent to the Builder. Your LGTM is not the user's approval.
Context: docs/handoff/2026-11-05-phase-3-subscriptions.md, SPEC.md V25, V26, V28, V30, V31.
Look hardest at: lib/money/subscriptions.ts firstIndexFrom and month-end clamping; costTotals
rounding once per currency; the form keeping the anchor on edit (components/money/subscriptions.tsx
submit); sub ops in lib/money/outbox.ts supersedes and money-runtime.ts settleRow/unhideRow;
raiseMoneyAlerts in the shell layout (never throws, merged with the notices read); the island
alert dropping paused, cancelled or deleted subscriptions; the PageFrame header wrap on other pages.
```
