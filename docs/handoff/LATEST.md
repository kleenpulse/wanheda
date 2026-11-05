# Latest hand-off

**Newest:** [2026-11-05-phase-4-income-dashboard.md](2026-11-05-phase-4-income-dashboard.md). **Phase 4 CP3 (T42, income dashboard) built on `phase-4/income-dashboard`; Reviewer wanheda-e9 FIX (revenue without MRR invisible) → fixed → LGTM ⇒ committed, pushed, PR opened; merge on green checks (user's overnight order).** PR #26 (T41) merged. Built: `/income` app (MRR and customers over time, movements stacked by kind, monthly bridge, revenue by product, churn, ARPA, LTV, Polar parity per product per V36), widgets `income.mrr` + `income.net-new`, per-product palette commands, `income` notices → `/income`, demo from the seed through the engine. No new SQL, no new deps. Typecheck, Vitest 79 files / 855, tripwire, ESLint on touched files pass; demo browser run done. Standing order tonight (user): review → PR → green → merge → next task; `db:migrate` stays the user's. `app/globals.css` is another session's edit: left out.

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

Read docs/handoff/2026-11-05-phase-4-income-dashboard.md first. If the T42 PR is merged:
`git fetch`, check `sh scripts/forged-commits.sh <old main>..origin/main`, fast-forward main,
branch phase-4/net-goals and build T43 per SPEC §T (net view from ledger txns, savings rate,
runway; SaaS revenue its own line, never added; goals with linear projection; income alerts in
the island and the centre). Leave app/globals.css out. Never bunx an unpinned tool.
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only. One pass, bugs and edge cases only, verdict LGTM / LGTM with nits / FIX, sent to the
Builder. Your LGTM is not the user's approval.
Target: the T42 diff on phase-4/income-dashboard (uncommitted). Riskiest: money never summed
across currencies (toFacts, currenciesOf, revenue folds, widgets); parity units (Polar USD cents,
subscriptions vs customers, tolerance); `—` for null metrics; monthlyRows bounds ((from, to],
partial month); V24 (no page skeleton on a hop, Prefetch in Suspense, hydration gate); demo never
touching the DB; loadIncome scoped by user_id on every table.
Context: docs/handoff/2026-11-05-phase-4-income-dashboard.md.
```
