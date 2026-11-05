# Latest hand-off

**Newest:** [2026-11-05-phase-4-mrr-engine.md](2026-11-05-phase-4-mrr-engine.md). **Phase 4 CP2 (T41, MRR engine) built on `phase-4/mrr-engine`; Reviewer wanheda-e9 FIX → fixed → LGTM ⇒ committed, pushed, PR opened; the user merges.** PR #25 (T40) merged. First commit `b6633ef` adds `.gitleaksignore` lines for the fake Polar token in `9f8bf66` (CI rails fix). Built: pure `movementsFrom` / `mrrAt` / `metrics` / `revenueFrom` (V35 `?` settled against Polar's source), V37 alerts (`income` notices), computed + Polar `metric_snapshot` rows, `reconcile()` rebuilding `mrr_movement` in one batch, rebuild action + palette command, demo seed. No new SQL. `CONNECTOR_SEAL_KEY` added to Vercel Production (Sensitive, never printed). Reviewer FIX (concurrent reconcile: locked write + re-check loop) fixed and LGTM'd. Typecheck, Vitest 78 files / 839, tripwire, ESLint on touched files pass. `app/globals.css` is another session's edit: left out.

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

Read docs/handoff/2026-11-05-phase-4-mrr-engine.md first. If the T41 PR is merged: `git fetch`,
check `sh scripts/forged-commits.sh <old main>..origin/main`, fast-forward main, branch
phase-4/income-dashboard and build T42 per SPEC §T: the /income app (manifest, rail, palette,
widgets MRR + net new this month), MRR over time stacked by movement kind, monthly waterfall,
revenue by product (revenueFrom), customers over time, churn %, ARPA, LTV (dataviz skill;
<MoneyText>, privacy), Polar vs computed parity readout from metric_snapshot (V36: mismatch > 1
minor unit per active sub marked, never hidden; Polar is USD and counts subscriptions), per-product
view, V24 (cache first, server read in Suspense), demo from lib/saas/seed.ts demoMovements. Set
the `income` notices' href to /income. Leave app/globals.css out unless the user says otherwise.
Test fixtures never hold real-looking secrets. Never bunx an unpinned tool.
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only. One pass, bugs and edge cases only, verdict LGTM / LGTM with nits / FIX, sent to the
Builder. Your LGTM is not the user's approval.
Target: the next Builder's T42 diff (phase-4/income-dashboard). Riskiest: money never summed
across currencies; every figure through <MoneyText> + privacy; `—` for null metrics; parity
readout units (Polar USD cents, subscriptions vs customers); V24 (no page skeleton on a hop,
cached first); demo path never touching the DB. Context: docs/handoff/2026-11-05-phase-4-mrr-engine.md.
```
