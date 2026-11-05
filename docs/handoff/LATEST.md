# Latest hand-off

**Newest:** [2026-11-06-phase-4-net-goals.md](2026-11-06-phase-4-net-goals.md). **Phase 4 CP4 (T43: net view, goals, income alerts on the island) built on `phase-4/net-goals`; Reviewer wanheda-e9 LGTM with nits (both taken) ⇒ committed, pushed, PR opened; merge on green checks (overnight order).** PR #27 (T42) merged under the user's overnight order (review → PR → green → merge → next task). Built: `/income` as three pages (Products, Net, Goals) with shared `RouteTabs`; net = ledger income − spending in the base currency, savings rate, cash, runway; SaaS revenue beside, never added; MRR and savings goals with a 90-day projection; island `saas-alert`. Decisions taken overnight are listed in the hand-off for the user to check. No new SQL (`goal` ∈ 0006), no new deps. Typecheck, Vitest 82 files / 872, tripwire, ESLint on touched files pass; demo browser run done. **Next: T44 needs the user** (real Polar org + metrics token), so the loop stops after T43. `app/globals.css` is another session's edit: left out.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests). The Builder and Reviewer prompts below are copied from it.

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04,
tightened 2026-11-05): build features; tests only where they guard real logic or a spec exit
case; keep tripwire, forged-commit check and CI; one typecheck + test run before a commit;
after the Reviewer peer's LGTM (or LGTM with nits) commit, push and open the PR without asking
(user 2026-11-05); merge and db:migrate stay the user's unless the user has said otherwise for
the session. A short hand-off + continuation prompt after every PR. No worktrees. House goal
(CLAUDE.md): native-app feel, V24.

Read docs/handoff/2026-11-06-phase-4-net-goals.md first. T44 (Phase 4 exit) needs the user:
a Polar organization access token with metrics:read; connect, map products, Sync now, then
compare Polar's MRR to Wanheda's /income parity card on the same day. Run the other T44 exit
checks (same webhook 3x = no change; refund before payment; rebuild = same numbers) against
the owner's data with the user, then write the Phase 4 done hand-off with Phase 5 prompts.
Leave app/globals.css out. Never bunx an unpinned tool.
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only. One pass, bugs and edge cases only, verdict LGTM / LGTM with nits / FIX, sent to the
Builder. Your LGTM is not the user's approval.
Target: the T43 diff on phase-4/net-goals (uncommitted). Riskiest: money never summed across
currencies (netByMonth/cashIn convert per V26, missing rates kept apart; MRR goals one currency);
goalProgress projection maths and statuses; saveGoal ownership (setWhere user, product owned);
optimistic goal writes vs a background refetch; undo-delete only on expiry; runway's month
filter; island alert window (48 h, unread, V37 keys); V24 (no skeleton on a hop between the
income pages; money Prefetch in Suspense).
Context: docs/handoff/2026-11-06-phase-4-net-goals.md.
```
