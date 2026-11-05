# Hand-off — Phase 3: Money I — CP5 budgets, rules, FX (T38)

| | |
|---|---|
| Date | 2026-11-05 |
| Phase / checkpoint | Phase 3 — CP5 (T38), built; PR #21 open |
| Branch | `phase-3/budgets-fx` (off main `e52e152`, PR #20 merged) |
| HEAD | `76307c5` feat: budgets, rules, FX and privacy mode (T38), plus this hand-off commit |
| Previous hand-off | docs/handoff/2026-11-05-phase-3-import.md |

## State in one paragraph

PR #20 merged as `e52e152` (forged-commit check clean on `3fa1a58..origin/main`, 3 commits, all +0100). The user OK'd the T37 SPEC draft; it is applied in the working tree (T37 → x, V12/V24/V30 notes, B15–B17). T38 is built end to end, plus four user requests made during the session: privacy mode as dots (not blur), the show/hide eye in the app-wide top bar, a stronger dark-mode dock shadow, "Other" → name a real category in the txn form (relayed by the UI session `wanheda-f7`), and the Home billing-cycle card with a pin picker. No new SQL: `budget`, `rule`, `fx_rate`, `user_prefs.base_currency` were all in `0004`. The user chose one PR with everything in the tree (their words: "All in one, make the PR"): committed as `76307c5` (author = committer TZ +0100, forged-commit check clean, tripwire clean, gitleaks not installed locally so CI scans), pushed, PR #21.

## Done this session

- **FX** (`lib/money/fx.ts`, `fx-store.ts`, `GET /api/money/fx?from=`): source = fawazahmed0 currency API (user's pick: free, no key, NGN, history from 2024-03-02; jsDelivr then pages.dev mirror). Stored USD-pivot, direction ≥ 1, 8 dp strings; read as exact fractions; a figure converts at its own day's rate or the latest earlier one; no rate → kept apart per currency (V26). No cron: the owner's first read of a day fetches "latest", older missing days are filled 31 per read, newest first; `incomplete` makes the client poll every 4 s. Failed days are left alone 1 h per instance. Demo: fixed table, never fetches.
- **Converted reports** (`lib/money/converted.ts`): Entries/Analytics headline tiles are always in the base currency, exact sum, rounded once, with a "From $x + ₦y" line and unrated currencies apart. Analytics picker: "Charts: all in NGN" (default when there are several currencies and rates) or one currency only; "all" converts each entry once (rounded) for bars, heatmap, pace line and breakdown, with a notice for entries left out.
- **Budgets** (`lib/money/budgets.ts`, `plans-store.ts`, `actions/plans.ts`, `/money/budgets`): overall + per category (children count), other currencies converted, rollover = last month's leftover or overspend, one month only, and only if the budget existed then. One per category: a second is refused as `taken` (checked first, unique-violation caught too). Alerts 80/100 % (only the highest reached), key `budget:<id|all>:<YYYY-MM>:80|100`, text without amounts, raised on shell load, after every txn save and after a budget save (stored rates only). Island shows them (Open → Budgets, Dismiss), dropped when the month ends or the budget is gone. Pace line: dashed level for a month's overall budget in the chart currency.
- **Rules** (`lib/money/rules.ts`, `/money/rules`): payee contains (case and spacing ignored) → category and/or tags; first match by priority wins; reorder up/down (renumbers), on/off, "matches N entries in the last 3 months" live in the form. Applied to new entries left uncategorised (client, `useMoneyApi.save`; edits untouched) and to every imported row (server, `importStatement`; demo import on the client). A rule whose category is archived only adds tags.
- **Outbox** (V28): new ops `budget-save|delete`, `rule-save|delete` (row writes, supersede like subs), `category-save` (never dropped, like accounts). Txn save results carry budget notices.
- **Privacy mode**: `H` (not typing), palette, Settings › Money, and the eye in `PageFrame`'s top bar on every page. Device-local. `<MoneyText>` and chart axis ticks show `₦••••` (sign and currency kept, 4 dots always). Boot script sets `data-privacy` before paint; `app/privacy.css` hides any not-yet-masked `[data-money]` until hydration. Browser-checked: 0 figures leaked during a reload, 0 console errors.
- **Base currency** in Settings › Money (optimistic, synced, `saveBaseCurrency`); **export** CSV (ledger, formula-injection guarded) and JSON (every table) at `/api/money/export?format=`.
- **Home widgets**: `money.today` (spent today, month so far, Add), `money.budget`, `money.renewals` (now the liquid billing-cycle card: one active sub → that one; several → a pin picker, default the costliest, stored on the device; Figtree 900, 124 px on Home, 84 px on Subscriptions). All three in the seed board.
- **Category from "Other"** (txn form): Other / Other income last in the list (UI session's sort), a "Name it" field; a live same-kind name is reused, else a new top-level slug-less category (🏷️, slate) is queued before the txn; archived same-name → new one; server refusal → waiting entries re-queued without a category + toast.
- **Dock**: dark skins' `--shadow-dock-value` = inset top highlight + contact shadow + wide halo.

## Verification (actual results)

- `bun run typecheck` pass. `bun run test`: 58 files / 690 passed (twice). One run had 1 failure, `money-runtime.test.ts > keeps a failed save and sends it again…`; it passed 3/3 alone right after: the load flake the last hand-off saw, now named.
- `bun run tripwire` clean. ESLint clean on every touched file. `bun run build` pass (`/money/budgets`, `/money/rules` ◐; `/api/money/fx`, `/api/money/export` ƒ).
- Demo browser run (prod build, blank env on :3305, isolated context): Budgets figures equal a hand count from `/api/money` (overall ₦482,408.85 = ₦461,550 + $15.49 × 1,346.60127178; Food ₦19,000; carry ₦180,000 − ₦86,750 = ₦93,250); privacy dots on Budgets, Analytics (axes, originals line, budget legend) and Home; palette "5000 shoprite" → Groceries by rule; "Other" → "Gym" saved, listed above Other; Home pin picker → Netflix, stored; export CSV 131 rows + header, JSON all tables, `format=xml` → 400.
- **Not run:** owner mode against Neon (FX fetch + `fx_rate` inserts, budget/rule/category writes, budget alerts in the centre). No migration needed.

## Decisions made

- FX source fawazahmed0 (user). Fetch on read, no cron (as V31). Days before 2024-03-02 never fetched → those entries stay split by currency.
- Analytics "all in base" rounds per entry; headline totals and budgets are exact (V26 amendment drafted).
- Rollover carries one month only. Only the highest alert level is raised.
- Rules: first match wins; owner's category pick always stands.
- Privacy, Home cycle pin: device-local (localStorage). Base currency: synced.
- Archived category with the typed name: a new category, not revived.

## Security note (my slip)

I ran `bunx prettier` once: prettier is not a project dependency, so bunx fetched `prettier@3.9.10` into `%TEMP%\bunx-…-prettier@latest` and ran it. Checked after: published 2026-10-10 (26 days, past the 7-day rule), sha512 equal to the registry's, no install scripts, incident IOC regex → one hit only: a short marker matching inside a TypeScript diagnostic message name in its bundled plugin (a false positive; no campaign tag, loader key or C2 address). It reflowed `lib/money/import-store.ts`; restored from HEAD and re-applied by hand. Saved a memory: never bunx a tool that isn't pinned.

## Staging (needs the user)

Another session (`wanheda-f7`, gone by the end) left uncommitted UI work in the same tree. Files with **only its** edits: `app/(shell)/layout.tsx`, `components/notes/notes-app.tsx`, `components/shell/dock.tsx`, `components/shell/nav-rail.tsx`, `components/ui/menu.tsx`, `components/ui/select.tsx`, `components/ui/calendar.tsx`, `components/money/subscriptions.tsx`. Files with **both**: `app/globals.css` (its Nebula-flat tokens + `--shadow-dock` / my dock values), `components/money/txn-form.tsx` (its `grouped()` sort + `pl-7` / my Name-it field), `components/money/money-app.tsx` (its `h-10` DatePickers, which need its `calendar.tsx` / my FX work). Everything else in `git status` is mine. Resolved: the user chose one PR with all of it; every file was staged by name (72 paths, all under app/, components/, lib/, actions/, docs/ and SPEC.md).

## Drafted for SPEC (needs the user's OK, then the spec skill applies it)

- T38 → x with the build notes above.
- V25 + privacy: hidden figures show `••••` with sign and currency (`maskMoney`), `data-masked`; CSS hides unmasked `[data-money]` while `html[data-privacy]` (no flash).
- V26 + analytics "all in base": each entry converted at its day's rate and rounded once, then added; headline totals, budgets and Home are exact sums rounded once. Source fawazahmed0, fetched on read, ≥ 2024-03-02.
- V31 + budget alerts: raised on shell load, after a txn save and after a budget save; only the highest level reached; island card until dismissed or the month ends.
- V28 + ops: budget/rule saves and deletes are row writes; `category-save` is never dropped.
- B18: `bunx` of an unpinned tool ran unvetted npm code and reflowed a file (caught, verified clean, restored) → C (stack rules): no `bunx` for tools outside `package.json`.

## Next steps

1. PR #21 (https://github.com/kleenpulse/wanheda/pull/21): CI, Reviewer pass (one pass: code + edge cases), user merges. Then stop: the next checkpoint starts in a new session.
2. Owner check on Neon: Analytics in a mixed month (rates fetched, `fx_rate` rows appear), a budget crossing 80 % → notice + island, export downloads.
3. Apply the SPEC draft on the user's OK.
4. Next checkpoint: T39 (Phase 3 exit) in a new session.
5. Open: Accounts card net worth and Subscriptions totals are still per currency (not converted); a Home prefetch of money was left out on purpose (widgets read the client cache).

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04):
build features; keep tripwire, forged-commit check and CI; one typecheck + test run before a
commit; commit, push and PRs only on the user's word; a short hand-off + continuation prompt
after every PR. No worktrees: branch off main in D:\Vxrcel\wanheda itself. One checkpoint per
session: after its PR merges, stop and hand over. House goal (CLAUDE.md): native-app feel, V24.

Read docs/handoff/2026-11-05-phase-3-budgets-fx.md first. T38 is PR #21 (phase-3/budgets-fx,
`76307c5`, with the UI session's edits in the same PR). Start:
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
