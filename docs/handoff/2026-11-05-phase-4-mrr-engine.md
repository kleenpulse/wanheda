# Hand-off — Phase 4 CP2: MRR engine (T41)

| | |
|---|---|
| Date | 2026-11-05 |
| Phase / checkpoint | Phase 4 CP2, T41 `phase-4/mrr-engine`, built. Reviewer wanheda-e9: FIX (1) → fixed → LGTM ⇒ committed, pushed, PR opened (user 2026-11-05: PR after the Reviewer's LGTM). wanheda-ba is the session editing app/globals.css, not a reviewer |
| Branch | `phase-4/mrr-engine` (off main `d419c7d`; PR #25 merged; forged-commit check on `d419c7d..origin/main` clean, 0 commits) |
| Previous hand-off | docs/handoff/2026-11-05-phase-4-income-core.md |

## State in one paragraph

PR #25 (T40) is merged. The first commit on this branch, `b6633ef`, adds two `.gitleaksignore` lines for the fake Polar token in `9f8bf66` (`lib/saas/server.test.ts` lines 29 and 105, replaced in `ed59cfc`). That token is why CI `rails` failed on main's history. gitleaks isn't installed locally, so CI is the check. T41 is built and not yet committed:

- the pure MRR engine, metrics and revenue fold
- the V37 alerts
- computed and Polar `metric_snapshot` rows
- `reconcile()`, which rebuilds the movements in one transaction
- a rebuild action and a palette command
- demo seed events

There is no new SQL. At the user's request, `CONNECTOR_SEAL_KEY` was added to Vercel **Production**: a fresh 32-byte key, piped straight from the generator into `vercel env add`, typed Sensitive, never printed. Before that, the global `vercel` CLI was checked: no worm markers, and no file in it changed since its 2026-07-07 install.

## Done this session

- **V35 `?` settled**, by Zeta reading the polarsource/polar source at `72d9d96`; the hosted OpenAPI returns 404.
  - Polar's `subscription.amount` is **after** the discount. It goes back up when a repeating discount runs out.
  - It is before tax-exclusive tax.
  - Polar's own MRR uses an internal `net_amount`, which also strips tax-inclusive VAT. Webhooks don't carry it, so parity can differ on tax-inclusive prices.
  - Normalisation matches Polar's metrics SQL: month ÷ count, year ÷ 12·count, week × 52 ÷ 12·count, day × 365 ÷ 12·count.
  - Polar's metrics are in USD cents and count subscriptions, not customers.
  - Statuses include `paused`.
- **`lib/saas/mrr.ts` (pure).** How it reads the log:
  - Each subscription snapshot is the truth until the next snapshot of that subscription.
  - The first snapshot also tells the history before it, from `started_at` or the trial's end. So a first pull of an old subscription starts its MRR on its real start date.
  - Only changes become deltas, so a webhook copy and a pull copy of one state count once (T40 review nit 2).
  - Movements are per product, customer, currency and UTC day. A same-day plan swap is one expansion.
  - Cancel at period end churns on `ends_at`, once `asOf` has passed it. An uncancel drops the scheduled churn.
  - Trial counts 0. `past_due` counts until revoked. An unknown status or interval leaves the previous snapshot standing.
  - Movement key: `<product>:<billing_event id>:<kind>:<day>`. The store turns it into a sha256-based uuid v8.
  - `metrics()`: V36 figures, `null` for a zero denominator.
  - `revenueFrom()`: order `net_amount`, refunds that succeeded, and a refund that arrives before its order.
- **`lib/saas/alerts.ts`:**
  - V37 keys, new and churn alerts within 48 h.
  - A failed payment is keyed by when its past_due run started.
  - MRR milestones (100 … 1M major units) alert when crossed upwards, per product, and as `all` when only one currency.
  - Notification kind `income`, with a TrendingUp icon. `href` is null until `/income` exists (T42).
- **`lib/saas/snapshots.ts` + Polar client `metrics()`** (`GET /v1/metrics/`, interval day, UTC, 4 slugs):
  - Computed rows for the last 30 days, per live mapped product and overall. A row's currency is the one with the most MRR; the others go in `extra.byCurrency`.
  - Polar rows for the same days.
- **reconcile():**
  - `writeDerived` is one neon-http batch: a per-connector advisory lock, delete the connector's movements, insert the new ones, upsert the computed snapshots.
  - After the write, it counts the log again and runs again if the log grew (at most 3 runs; a failed write is retried). Then `addNotices`, once.
  - Archived products keep their movements but get no snapshots or alerts.
- **Sync:** events → reconcile → `pullPolarMetrics`. If the metrics call fails, the sync still succeeds and the connector shows a warning in `last_error`.
- **Action `rebuildIncome`** and palette **"Rebuild income figures"**.
- **Demo:** `lib/saas/seed.ts` holds about 8 months of Polar-shaped events for the two demo products (`DEMO_PRODUCTS` moved here from `server.ts`). In this run Motion Garden shows $659.50 MRR from 37 customers and rawstash $189.00 from 43.
- **SPEC:** V35 (settled `?`, movement id, statuses), V36 (parity notes), T41 → x, §I "P4 CP2".

## Review (wanheda-e9, one pass)

FIX, plus one nit:
1. **FIX: concurrent `reconcile()`.** Polar sends webhooks in bursts, and each delivery queues its own `after(reconcile)`. A run that read an older log could fail on a duplicate key or overwrite a newer run's rows, leaving MRR, snapshots and alerts stale until the next event.
   - **Fixed:** the write takes `pg_advisory_xact_lock(hashtextextended('reconcile:<id>', 0))` first, and movements and snapshots now share one transaction. Each run re-counts `billing_event` after writing and runs again if the log grew (at most 3 runs), and a failed write is retried.
   - Checked on Neon: the lock is held inside the batch and released after.
   - Tests in `lib/saas/reconcile.test.ts`.
2. **Nit, taken:** `metrics()` counts a customer as lost when they paid at the period's start and pay nothing at its end, not when they have a churn movement. A customer who drops one product but keeps another isn't lost in the overall view. Test added.

Second look on the fix: **LGTM, no FIXes.** If a burst outlasts 3 runs, the newer delivery's own `after()` reconcile picks it up.

## Verification (actual results)

- `bun run typecheck`: pass.
- `bun run test`: 78 files, 839 passed (after the review fix).
- `bun run tripwire`: clean.
- ESLint: clean on every touched file.
- Neon: the advisory lock is held inside a batch (`pg_locks` shows 1 for the backend) and released after it (0). `EXPLAIN` of the snapshot upsert names arbiter `metric_snapshot_day_uq`. `EXPLAIN` of the movement delete plans through `billing_event_connector_occurred_idx`. Postgres 18.6; nothing was executed.
- Not run: `bun run build` and a browser pass (lean mode). The palette command is wired but hasn't been clicked.

## Not done / open

1. **Owner parity check** (needs the user): a Polar Organization Access Token with `metrics:read` as well as the T40 scopes; connect, map the products, Sync now. Then compare the computed and Polar `metric_snapshot` rows (T44 exit).
2. The overall (`product_id` null) computed snapshot is built per connector. That's right while one Polar organization is the only connector; T45 has to merge connectors.
3. `app/globals.css` holds someone else's Bench palette edit: left out of every commit.
4. Still open from Phase 3: `local-store.ts` test (needs `fake-indexeddb`); Accounts and Subscriptions totals per currency.

## Files for the commit (stage by name)

`SPEC.md`, `actions/connectors.ts`, `components/notifications/notification-centre.tsx`, `components/shell/command-palette.tsx`, `lib/notifications/notifications.ts`, `lib/saas/polar/client.ts`, `lib/saas/reconcile.ts`, `lib/saas/server.ts`, `lib/saas/server.test.ts`, `lib/saas/store.ts`, `lib/saas/mrr.ts`, `lib/saas/mrr.test.ts`, `lib/saas/alerts.ts`, `lib/saas/alerts.test.ts`, `lib/saas/snapshots.ts`, `lib/saas/seed.ts`, `lib/saas/seed.test.ts`, `lib/saas/reconcile.test.ts`, `lib/db/fake.ts`, this hand-off and `docs/handoff/LATEST.md`. **Not** `app/globals.css`.

## Next steps (in order)

1. Done: committed, pushed and the PR opened after the Reviewer's LGTM. The user merges.
2. After the merge, a fresh session: T42 `phase-4/income-dashboard` (`/income` app reading `mrr_movement` + `metric_snapshot`; demo from `demoMovements`; set the `income` notices' `href` to `/income`).

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
