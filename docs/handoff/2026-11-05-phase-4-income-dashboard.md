# Hand-off — Phase 4 CP3: income dashboard (T42)

| | |
|---|---|
| Date | 2026-11-05 |
| Phase / checkpoint | Phase 4 CP3, T42 `phase-4/income-dashboard`. Built; Reviewer wanheda-e9: FIX (1) → fixed → LGTM ⇒ committed, pushed, PR opened; merged on green checks under tonight's standing order |
| Branch | `phase-4/income-dashboard` (off main `af04f43`; PR #26 merged; forged-commit check on `d419c7d..origin/main` clean, 3 commits) |
| Previous hand-off | docs/handoff/2026-11-05-phase-4-mrr-engine.md |
| Standing order tonight | User (2026-11-05, going to bed): loop "answer questions yourself → peer review → LGTM → PR → checks green → merge → next task → repeat". Merge is the user's go-ahead for tonight's loop only; `db:migrate` is still the user's. |

## State in one paragraph

T42 is built, reviewed (FIX → fixed → LGTM) and committed. `/income` is a new app in the rail, built from the `INCOME` manifest. It reads one TanStack Query entry (`INCOME_KEY`), filled by the page's `Prefetch` (in its own Suspense) or by `GET /api/income`. The client folds every figure itself with the T41 engine's `metrics()`, so switching product, range or currency costs nothing. There is no new SQL and no new dependency.

## Done this session

- **`lib/saas/income.ts` (pure):**
  - The payload type.
  - `toFacts`: a currency Wanheda can't format is set aside and named, never shown as another currency.
  - `currenciesOf`, `monthlyRows` (start + Σ kinds = end), `rangeMonths` (6m, 12m, all) and `headline`.
  - Revenue folds: refunds stay their own figure, and nothing is summed across currencies.
  - The V36 parity rule. A day matches if |Polar − ours| ≤ 1 minor unit × Polar's active subscriptions. It is "not comparable" when the currencies differ or our row left a currency out. Parity is read per product only.
- **Server:**
  - `loadIncome` in `lib/saas/store.ts`: one batch for products (live, plus archived ones with history), connectors, movements, the last 30 days of snapshots, and order and refund events.
  - `incomeFor` / `demoIncome` in `lib/saas/income-server.ts`. Demo runs the seed log through the same engine and never touches the database. Its Polar side mirrors ours, with one sample day off on rawstash so the mark shows.
  - `GET /api/income`: `requireOwner` first, and 503 on load-failed.
- **UI (`components/income/`), hand-drawn SVG on the T35 chart kit:**
  - MRR over time and customers over time (line).
  - MRR movements by month: a diverging stack by kind, with a net tick. Clicking a month or pressing Enter picks it.
  - The MRR bridge (waterfall) for the picked month. It defaults to the newest month that moved.
  - Revenue by product (ranked, product colour plus name), or revenue by month in one product's view.
  - The Polar parity card: every state has an icon and a word, off days are counted, and the table lists every day.
  - Eight tiles: MRR/ARR, net new this month vs last month, customers, ARPA, customer churn, net MRR churn, LTV and new sign-ups. Churn and LTV are over the trailing 30 days. Null shows as `—`.
  - The view lives in `?product=`, `?range=` and `?currency=`, through the new `hooks/use-url-param.ts`, which money's `?p=` now shares.
- **Kind colours** (dataviz validator, both skins, in stack order): new blue, expansion aqua, reactivation yellow, contraction magenta, churn violet. Worst adjacent CVD ΔE is 9.1 in light and 8.4 in dark. Light-mode contrast is under 3:1 for three of them, which the legend and table twin answer.
- **Widgets** `income.mrr` and `income.net-new` show every product in the main currency. Both are in Home's seed layout; `lib/board/layout.test.ts` requires every widget there.
- **Palette:** "Open <product> income", read from the cache only, so there is no fetch per open.
- **Income notices** now have `href` `/income`. A per-product href was left out on purpose: a push to `/income?product=` while already on `/income` would not reach the location-read hook.

## Review (wanheda-e9, one pass)

FIX, plus one nit:
1. **FIX: revenue with no MRR beside it was invisible.** An owner selling only one-time purchases saw the empty state, and orders in a currency with no MRR were never offered in the picker.
   - **Fixed:** the empty state now shows only when there are no movements *and* no revenue (`hasIncome`).
   - The scope's currencies are now the MRR ones (most MRR first) plus the revenue-only ones (`scopeCurrencies`).
   - "All time" starts at whichever comes first: the first movement or the first paid month.
   - The MRR tiles and charts render only when the chosen currency has MRR; otherwise a "revenue only" notice shows. Revenue and parity always render.
   - 4 tests.

   Second look on the delta: **LGTM, no FIXes.**
2. **Nit, taken:** `revenueByMonth` now really drops currencies Wanheda can't format.

## Verification (actual results)

- `bun run typecheck`: pass.
- `bun run test`: 79 files, 855 passed (16 of them new, in `lib/saas/income.test.ts`).
- `bun run tripwire`: clean.
- ESLint on every touched or new file: clean. One pre-existing error in an untouched file: `components/widgets/weather-widget.tsx:60`, react-hooks "component created during render".
- **Demo browser run** (zero-env dev server; env keys blanked for that process only, `.env.local` untouched):
  - MRR shows $848.50, which matches T41's $659.50 + $189.00.
  - The rawstash view comes up via `?product=`.
  - Parity marks the sample off day.
  - Home widgets paint from the cache.
  - A hop from Home to Income paints in 33 ms with no skeleton.
  - Privacy: all 27 figures on `/income` are masked.
  - Checked in Nebula at 1440 px and Ember at 400 px. No console errors.
- Not run: `bun run build`, and an owner run against Neon.

## Not done / open

1. Owner parity on the real Polar org (T44 exit; needs a token with `metrics:read`).
2. Home widgets kept mounted but hidden after a hop keep their old mask until they're shown again. This predates T42 and applies to Money's widgets too. Seen while checking privacy.
3. `app/globals.css` holds another session's palette edit; it is left out of every commit.
4. Still open from earlier: the `local-store.ts` test, and per-currency totals.

## Files for the commit (stage by name)

`SPEC.md`, `lib/modules.ts`, `lib/board/layout.ts`, `lib/saas/alerts.ts`, `lib/saas/store.ts`, `lib/saas/income.ts`, `lib/saas/income.test.ts`, `lib/saas/income-server.ts`, `app/api/income/route.ts`, `app/(shell)/income/page.tsx`, `components/income/use-income.ts`, `components/income/income-app.tsx`, `components/income/parity.tsx`, `components/income/charts/kit.tsx`, `components/income/charts/trend-line.tsx`, `components/income/charts/movement-bars.tsx`, `components/income/charts/waterfall.tsx`, `components/income/charts/revenue.tsx`, `components/widgets/income-widgets.tsx`, `components/widgets/index.tsx`, `components/shell/command-palette.tsx`, `components/money/use-period.ts`, `hooks/use-url-param.ts`, this hand-off and `docs/handoff/LATEST.md`. **Not** `app/globals.css`.

## Next steps (in order)

1. Done: Reviewer LGTM; committed, pushed, PR opened; merge on green checks (tonight's standing order).
2. Then T43 `phase-4/net-goals` (see SPEC §T). If it needs a migration, stop before `db:migrate` and leave it for the user.

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
