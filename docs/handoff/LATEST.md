# Latest hand-off

**Newest:** [2026-11-05-phase-3-money-outbox.md](2026-11-05-phase-3-money-outbox.md) — **Phase 3 CP2b money outbox built** (T35b `x`) **+ `/money/analytics` split.** Branch `phase-3/money-outbox`, PR #17: analytics split, day cards back, and the outbox (Dexie queue for txn and account writes, B13 races ported, SyncChip counts money). No new SQL. Owner-mode check not done. Next: user's owner check (4 steps in the hand-off), optional Reviewer pass, merge, then T36 in a fresh session.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests). The Builder and Reviewer prompts below are copied from it.

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04):
build features; keep tripwire, forged-commit check and CI; one typecheck + test run before a
commit; commit, push and PRs only on the user's word; a short hand-off + continuation prompt
after every PR. No worktrees: branch off main in D:\Vxrcel\wanheda itself. One checkpoint per
session: after its PR merges, stop and hand over. House goal (CLAUDE.md): native-app feel, V24.

Phase 3 CP3: subscriptions (SPEC T36). Read docs/handoff/2026-11-05-phase-3-money-outbox.md,
SPEC.md T36, V24-V31, ADR-0008 (money writes go through the outbox: components/money/money-runtime.ts,
lib/money/outbox.ts), and the money layout (app/(shell)/money/layout.tsx: Entries | Analytics
tabs). Money is integer minor units + ISO currency (V25); figures only through <MoneyText>.

Start: `git fetch`; check new commits with `sh scripts/forged-commits.sh cef4d98..origin/main`
before pulling; fast-forward main. Then `git switch -c phase-3/subscriptions`. Subscription
writes join the money outbox as new op kinds (same queue, so a subscription on a new account
lands after it). Decide where subscriptions live in the money tabs. Any new SQL: generate, show
it, apply only on the user's go-ahead.
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only. Lean mode: review when the user asks, one pass per PR, bugs and edge cases only,
verdict LGTM / LGTM with nits / FIX, sent to the Builder. Your LGTM is not the user's approval.
Context: docs/handoff/2026-11-05-phase-3-money-outbox.md, SPEC.md V24, V28, B13, ADR-0008.
Look hardest at: lib/money/outbox.ts supersede rule and drain loop; lib/money/local-store.ts
transactions and the persisted inFlight marker after a tab dies mid-send; money-runtime.ts
overlay settling (settleTxn, unhideTxn) against the undo toast; cross-tab BroadcastChannel
messages; the /money/analytics split (?p= and ?f= handling, Back).
```
