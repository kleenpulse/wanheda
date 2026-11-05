# Hand-off — Phase 3: Money I — CP1 money core

| | |
|---|---|
| Date | 2026-11-05 |
| Phase / tasks | Phase 3 planned in SPEC (T34–T39, invariants V25–V32). T34 (CP1) built and marked `x`; owner mode verified on Neon |
| Branch / PR | `phase-3/money-core`, cut from `main` at `d0bc942` in `D:\Vxrcel\wanheda`; commits `e7075a3` (CP1) + calendar + this hand-off, pushed and PR #15 opened 2026-11-05 on the user's go-ahead |
| Main | `d0bc942` — Merge pull request #14 (`phase-2/exit`). `git fetch` at session start found 0 new commits (forged-commit check clean) |
| Previous hand-off | docs/handoff/2026-11-05-phase-2-done.md |

## State in one paragraph

The user answered FRD open questions 3 and 4: import Nigerian **and** US bank statements (no banks named yet, so a generic column mapper comes first and per-bank presets get built from the owner's sample statements in T37), and the base currency is **switchable, default NGN**. Phase 3 is planned in SPEC as five checkpoints plus an exit row (T34–T39), with money invariants V25–V32. CP1 is built: the money schema (`drizzle/0004_money.sql`, **applied to Neon** on the user's go-ahead), `lib/money`, the `/money` app, palette quick-add, a house Select and a fading palette highlight. Next was bumped to 16.4.5 at the user's request. The Reviewer gave LGTM after three rounds, each fix recorded in SPEC.

## Done this session

- **SPEC.** V25 (money as safe-integer minor units, same-currency arithmetic only, `<MoneyText>` the only renderer), V26 (FX and normalisation are the only multiply/divide; rates stored ≥ 1), V27 (txn day = plain date; today = the owner's day in `user_prefs.time_zone`), V28 (ownership checks on every id; ≤ 1 live write per txn id), V29 (seed once; seeded rows archived, never deleted), V30 (renewals counted from the anchor), V31 (alert dedupe keys), V32 (import idempotency, undo = delete batch). T34–T39 rows. FRD open questions 3 and 4 and `docs/CONTEXT.md` (base currency) record the decisions.
- **Schema.** `money_account` (Better Auth already owns `account`), `category`, `txn`, `import_batch`, `import_mapping`, `rule`, `budget`, `subscription`, `fx_rate` (global, no `user_id`), all RLS on with no policies, with check constraints on currency codes, kinds, cycle, status and positive amounts. `user_prefs` gains `base_currency` and `time_zone`.
- **`lib/money`.** `currency.ts` (ISO exponents, `parseAmount` from digit strings with `k`/`m`, `formatMoney` passing the exact decimal string to Intl), `dates.ts`, `categories.ts` (25 defaults, 2 levels, aliases), `money.ts` (types, `txnWriteSchema` with no currency or user id, `flowOf`/`totals`, cache helpers), `quick-add.ts`, `seed.ts` (demo), `store.ts`, `server.ts`.
- **Calendar** (user asked for shadcn's): `components/ui/calendar.tsx` `Calendar` + `DatePicker`, shadcn anatomy hand-built on Base UI Popover instead of react-day-picker + date-fns (no new packages under the worm rails). Monday-first, WAI-ARIA date-grid keys, Today/Yesterday/2 days ago presets. Commit 2 on the PR.
- **Undo for delete** (user rule, also in memory: destructive actions get a confirm dialog or an undo). The row hides at once and the toast offers Undo; the server delete is sent only from the toast's `onExpire` (see below). If the tab closes inside the window, nothing is deleted. Not browser-tested by me; it's on the user's dev server via HMR.
- **Row titles in Figtree** (user).
- **Grow dialog** (user): Shadow Garden's `grow-dialog` ported to `components/ui/grow-dialog.tsx` for Edit, growing out of the row's pencil. Escape and Tab trap act only while focus is in the panel, so Escape in its Select/Calendar closes the popover, not the dialog.
- **Toast countdown bar** (user): signal (accent) colour, drains over the 9 s and pauses on hover/focus; the timer keeps the time left across holds. **Undo and × both cancel a delete**; only expiry (timeout, or pushed out by newer toasts) commits it. Toast exits are `onExpire` / `onClose` / action (5 tests).
- **Edit** (user asked; pulled forward from T35): pencil and bin icons on each row (no ellipsis menu, user) → Edit dialog with the form prefilled (same id, so the write replaces the row; Delete inside is the same undo). The day header total shows only when a day has 2+ spends (with one it repeated the row).
- **App.** `/money` (three stat tiles, the newest 60 txns by day, a row menu with Delete, the add form beside the list from @4xl, a one-thumb sheet on phones), `actions/money.ts`, `GET /api/money`, palette Money group, `components/money/txn-writer.ts` (per-id write slots), `components/ui/select.tsx` (Base UI, `glass-menu`), `--cat-*` data palette (dataviz validator on all four skins), Money manifest with the `DollarSign` icon (user's choice).
- **Next 16.4.5** (exact pin; it was `^16.4.3`). The 7-day cooldown was overridden for the Next packages only (`--minimum-release-age-excludes`); `bunfig.toml` is unchanged. Why: a security release with seven advisories, four of them on `use cache` and Cache Components.

## Verification (actual results)

- Typecheck clean, Vitest 40 files / 478 tests (on 16.4.5), tripwire clean, ESLint clean on every touched file. Two ESLint errors remain in untouched widget files (`today-widget.tsx`, `weather-widget.tsx`), pre-existing; lint doesn't gate.
- Zero-env build on **16.4.5** passes (rerun with the calendar). Calendar in the browser: opens focused on today, ← ↑ walk to Wed 28 Oct and flip the month, Enter picks, closes and returns focus to the field.
- Zero-env build and a demo browser run on 16.4.3: palette `2.5k uber yesterday #work` landed under Yesterday and raised the month total by exactly ₦2,500; income through the form by keyboard; Select by keys (focus returns, the label names the trigger); Nebula desktop, Ember phone sheet with a chip, saved; the palette fade (open faded, hover tinted, leave faded, Enter while faded swallowed).
- Neon after the migration (read-only): 9 tables with RLS on, checks, uniques and FKs match the SQL, the `txn.import_batch_id` FK cascades, `user_prefs` defaults are in, 5 migrations recorded, 0 money rows.
- The Next 16.4.5 packages were published by GitHub Actions through npm's trusted publisher (OIDC), with SLSA provenance and 2 registry signatures, and have no install scripts. The lockfile diff touched only the 12 Next packages. The incident record's IOC regex (markers, C2 addresses, every loader-key spelling) over their 8,899 files found nothing.

## In progress / not finished

- **Owner mode works**: the user logged 2 txns on their dev server. Neon read-only after: 25 seeded categories (25 distinct slugs, 3 children with parents), 1 Cash account, both txns' currency = their account's, no cross-user rows. Still open: the archive → re-seed check (writes owner data, so only with the user's go-ahead).
- Money writes are not queued across reloads (3 retries at 2, 6 and 15 s, then a toast and the write is dropped). Decide in T35 whether money gets a Dexie outbox like notes (ADR-0008).

## Decisions made

- Base currency switchable, default NGN; import NG and US statements; banks not named yet.
- In code, money is `{minor: number, currency}` with `Number.isSafeInteger` checked at every boundary. The DB column stays `bigint` (read in `mode: "number"`). Sign: < 0 is money out.
- A txn's day is a `date` column with no time zone (`posted_on`). "Today" uses the owner's time zone, never the server clock (fra1 runs on UTC).
- Next pinned to 16.4.5 with a scoped cooldown override (user, 2026-11-05).
- Native `<select>` and `<input type="date">` are out for good; use `components/ui/select.tsx` and `components/ui/calendar.tsx` (user, 2026-11-05).

## Bugs found

- B13 (caught in review, never shipped): a money save retrying in the background could bring back a txn deleted in the meantime; round 2 found that the first fix only waited on the previous write. Fixed by `createTxnWriter`.
- The Reviewer's early look caught two schema problems before the migration: no way to undo an import, and seeded defaults coming back after deletion. Both fixed in the SQL and in V29/V32.

## Gotchas found this session

- Better Auth owns the table name `account`. A Drizzle schema with a second `account` silently merges into it in `db:generate` (the generated output listed `account 13 columns`). Name money tables apart.
- One `next dev` per folder: the user's server on :3000 blocks a second one. For demo runs, do a zero-env `bun run build`, then `next start -p 3105`. **A `next start` left running keeps serving the old build after a rebuild** (500s on chunks, blank page); the new one fails with EADDRINUSE in its log. Kill by port in PowerShell (`Get-NetTCPConnection -LocalPort 3105`), not from bash, because bash eats `$_`.
- React's `onPointerLeave` is synthesised from `pointerout`; a synthetic `pointerleave` in a test does nothing.
- An item-level `truncate` (overflow hidden) clips anything that sticks out of the row (rings, badge dots). Truncate the label span only.
- `ripgrep` isn't on PATH. One ships inside the Antigravity IDE install, and that path has a space in it, so quote it.
- A `globals.css` edit (new `@keyframes toast-countdown`) can be missed by a running Turbopack dev server; restart it if the countdown bar doesn't animate. Next 16.4.4+ fixes this, but only after the dev server restarts on the new version.
- gitleaks isn't installed locally (the pre-commit hook warns); CI scans the history.

## Next steps (in order)

1. User merges PR #15.
2. **Stop.** T35 starts in a fresh session from the Builder prompt below.
3. In that session, first: try Edit and Undo on a delete in owner mode (neither was browser-tested by the Builder; both are on the user's dev server).
4. Build T35 (`phase-3/periods`): period views and comparison, totals per category, account and payee, the virtualised list, edit/delete, account management, and charts (dataviz skill first). Decide the money offline outbox question.
5. Before T37: ask the user for redacted sample statements from their NG and US banks.

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04):
build features; keep tripwire, forged-commit check and CI; one typecheck + test run before a
commit; no multi-round reviews or push/merge checks; commit, push and PRs only on the user's
word; a short hand-off + continuation prompt after every PR. No worktrees: branch off main in
D:\Vxrcel\wanheda itself. One checkpoint per session: after its PR merges, stop and hand over.
House goal (CLAUDE.md): native-app feel, SPEC V24.

Phase 3 CP2: periods and charts (SPEC T35). Read docs/handoff/2026-11-05-phase-3-money-core.md,
SPEC.md §V (V24–V32) and the T34/T35 rows, FRD §6.3 (D:\Vxrcel\wanheda\FRD.md) and
docs/CONTEXT.md. Money is integer minor units + ISO currency, never floats (V25); figures render
only through <MoneyText>; dropdowns use components/ui/select.tsx and days components/ui/calendar.tsx,
never native <select> or <input type="date">.

Start: `git fetch`; check new commits with `sh scripts/forged-commits.sh d0bc942..origin/main`
before pulling; fast-forward main. Owner mode works (seed verified on Neon). Every destructive
action gets a confirm dialog or an undo (user rule; delete uses the Undo toast, see
components/ui/toaster.tsx onDismiss). Then `git switch -c phase-3/periods` and build T35: today|week|month|custom
views with previous-period compare, totals per category|account|payee, virtualised txn list
(edit and undoable delete already exist), accounts (add, archive, opening balance, balance), and the charts (load the dataviz
skill first). Decide whether money writes get a Dexie outbox like notes (ADR-0008) and say why.
Any new SQL: generate, show it, apply only on the user's go-ahead.
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only (review the uncommitted tree or the PR diff with gh / git show; never switch the
Builder's branch). Lean mode (user, 2026-11-04): review only when the user asks, one pass per
PR, FIX-level findings only, no push or merge checks. Your LGTM is not the user's approval.
Context: docs/handoff/2026-11-05-phase-3-money-core.md, SPEC.md §V (V7, V24–V32) and §B (B13).
Look hardest at period maths on calendar days (V27: weeks Mon–Sun, previous-period ranges,
month ends), totals against a hand count, anything that multiplies or divides money (V26 only),
ownership checks on edits and accounts (V28), and any server read in front of a page's first
paint (V24).
```

## Files to read first

- `SPEC.md` §V V24–V32, §T T34–T39, §B B13
- `lib/money/money.ts`, `lib/money/store.ts`, `components/money/use-money.ts`, `components/money/txn-writer.ts`
- `drizzle/0004_money.sql`

## Env / services touched

- Neon: migration `0004_money.sql` applied (user's go-ahead). No data written.
- npm registry: Next 16.4.5 installed with a scoped cooldown override.

## Review state

Reviewer early look (2 FIX, fixed before the migration), full pass (1 FIX → B13), delta round 2 (1 FIX → claim chain), round 3: **LGTM**. No push or merge checks in lean mode.
