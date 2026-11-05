# Hand-off — Phase 3: Money I — CP4 import, core (plus subscriptions nits)

| | |
|---|---|
| Date | 2026-11-05 |
| Phase / checkpoint | Phase 3 — CP4 import (T37), pure core built; worker, server and UI not started |
| Branch | `phase-3/import` (off main `1fa07ab`), nothing committed yet |
| HEAD | `1fa07abf2f98e64add1e3141db9043382aa8dbcc` — Merge pull request #18 from kleenpulse/phase-3/subscriptions |
| Previous hand-off | docs/handoff/2026-11-05-phase-3-subscriptions.md |

## State in one paragraph

PR #18 (subscriptions, T36) merged as `1fa07ab`; the Reviewer's verdict was LGTM with nits, read after the merge. Both nits and the open React #418 are handled on `phase-3/subscriptions-nits`, PR #19 (open, user go-ahead for both commits). On `phase-3/import` the pure core of T37 exists and is tested: a CSV reader, an XLSX / HTML-table reader on `fflate`, the generic column mapper, V12 row keys and the V32 file key, 12 bank presets built from public descriptions of each bank's export, and recurring-charge detection (FR-MONEY-11). No worker, server action, saved mapping, preview UI or suggestion UI yet. No new SQL: `import_batch`, `import_mapping` and `txn.external_id` with its unique key are in `0004_money.sql` already.

## Done this session

- **PR #19** `phase-3/subscriptions-nits` (pushed, open):
  - `483bd4e` fix: month-end anchor on edit (Reviewer nit 1, V30). The suggested fix (shown next renewal with the day set to `min(anchor day, days in month)`) does not work: the shown day is already that clamped day. `editedAnchor()` in `lib/money/subscriptions.ts` instead anchors on an earlier renewal of the new schedule that keeps the old day of the month (Jan 31 monthly → every 2 months in Feb → anchor Dec 31: Feb 28, Apr 30, Jun 30, Aug 31), checked with `nextOn` so the next renewal from today never moves; falls back to the shown day. 6 tests. Also records #18 merged in LATEST.md.
  - `9b51585` fix: React #418 on money pages. Cause 1: money views render without the payload on the server; when the page's sibling `Prefetch` boundary hydrated first, the cache held it in the view's hydration pass and the view painted data over the server's skeleton (a hydration-order race, hence intermittent). `useMoney` now returns null until hydration ends; hops never hydrate, so V24 holds. Cause 2: `RollingNumber` read `useReducedMotionConfig()` (MotionConfig "user" = the OS setting) on the first client render. Gated on hydration too. `useHydrated` moved to `hooks/use-hydrated.ts`.
  - Nit 2 (`raiseMoneyAlerts` insert + select on every owner full load in `app/(shell)/layout.tsx`) left as a watch item: move to `after()` if shell TTFB grows.
- **T37 core** on `phase-3/import` (uncommitted):
  - `lib/money/import/csv.ts`: RFC 4180 reader (quotes, `""`, line breaks in cells, CRLF, BOM), delimiter sniffing past a preamble.
  - `lib/money/import/xlsx.ts`: `sniffSheet` by bytes (xlsx zip, binary xls refused, HTML table, text); `readXlsx` (first sheet via workbook rels, shared/inline/str cells, date-styled cells → day, any namespace prefix, 60 MB unpack cap); `readHtmlTable` (largest table); `numberText` cuts float noise to 15 significant digits on the digit string (V25).
  - `lib/money/import/mapping.ts`: `ColumnMapping` (zod, by header name so a saved mapping survives column moves): date + day/month order, amount `signed` (outflow sign per bank) | `split` (debit/credit) | `typed` (unsigned + Debit/Credit column), one payee column, balance?, reference?. `parseStatementDate`, `guessDateOrder`, `parseStatementAmount` (brackets, DR/CR, trailing minus, ₦ $ codes), `readTable` (header row or "Column N" when none), `guessMapping` (by names, or by cell content when headerless), `missingColumns`, `mapRows` (every skipped row listed with its reason, V32).
  - `lib/money/import/keys.ts`: `fileKey` = sha256(account id ‖ bytes); `rowKeys` per V12 (bank reference when unique in the file; else hash of reference?, day, amount, payee + running balance, else + occurrence index).
  - `lib/money/import/presets.ts`: Chase checking, Chase card, BofA checking, BofA card (unverified), Wells Fargo (headerless, 5 columns), Amex (charges positive; only the card-member or extended exports auto-match), Capital One card, Capital One 360 (unverified, typed), GTBank (both header spellings), Kuda, OPay, Moniepoint (unverified). `detectPreset` = most columns matched.
  - `lib/money/recurring.ts`: `detectRecurring(txns, subs, today)` — outflows, same normalised payee per currency, amount ±10 % of the latest, cadence ±3 d over week, 2 weeks, month, quarter, year, ≥ 3 hits back from the latest; one-offs at the same payee passed over; stopped (> 2 cycles) and already-subscribed payees left out. `recurringPayee` strips digit runs, card masks and channel words.
  - `fflate@0.8.3` added, exact.

## Verification (actual results, not intentions)

- `bun run typecheck`: pass (on both branches).
- `bun run test`: `phase-3/import` 50 files / 616 passed; `phase-3/subscriptions-nits` 46 / 578 passed.
- `bun run tripwire`: clean. ESLint clean on all new files.
- `bun run build`: zero-env build on the nits branch passed (three times, for the #418 runs). Not run on `phase-3/import` (no route changes yet).
- #418: zero-env production build on port 3305, 390 px mobile + reduced motion emulated (DevTools MCP). Old build: #418 on 2 of 2 loads; control without reduced motion clean. After the `RollingNumber` fix alone: still #418 (led to cause 1). After both fixes: 0 of 4 loads. Hop /money → Subscriptions renders the view with no skeleton frame. The user's own dev server on port 3000 was never stopped (it is behind sign-in, so it was not used).
- T37 exit criteria: the three V12 tests pass at the key level (2 identical rows → 2 keys; re-download → same keys; overlapping later statement → same keys for shared days). The DB-level "→ 0 rows" half needs the server action.

## Decisions made

- **Bank presets from public sources** (user, 2026-11-05: "get it from the internet" instead of their own samples). Research by a sub-agent: no bank documents its columns; headers come from importer configs (Firefly III, beancount.io, ng-bank-parser, bankstract, statement-kit) and sample files. Access Bank and Zenith (NG) export PDF only → no preset. Moniepoint, BofA card and Capital One 360 rest on one source → marked `unverified`. Every import still shows a preview to confirm.
- **XLSX: `fflate` + own reader** (user, 2026-11-05). Supply-chain read: 0.8.3 published 2026-05-16, matches GitHub release v0.8.3 ("Fix buffer over-read for Zip64 extra fields; sync flushes"); MIT, 1 maintainer, 0 deps, no install scripts, registry integrity matches the downloaded tarball; diff 0.8.2 → 0.8.3 of every built file = Zip64 extra-field parsing (`z64hs`) and sync flush only, risky-token counts identical, LICENSE year, package.json devDeps. Note: four backport releases on old lines (0.4.9, 0.5.4, 0.6.11, 0.7.5) were published within 6 s on 2026-07-20 with the same node/npm as 0.8.3 and no GitHub release; not used, and not inspected. Lockfile diff: fflate only.
- **A bank reference that repeats in a file is not a key on its own** (NG banks give a transfer, its fee and VAT one session id): those rows hash reference + day + amount + payee.
- Payee guessing picks one column by priority (payee / to-from / merchant, then description / narration / remarks), never joins Chase's "Details" (DEBIT/CREDIT) or Amex's multi-line "Extended Details".
- SPEC not amended yet: T37's row should record the XLSX decision and the presets' source when it is closed.

## Bugs found

- Subscriptions edit drift (V30) and #418 (above). Neither added to §B yet: add both when T37's SPEC row is updated (§B: #418 = hydration-order race between a `Prefetch` boundary and a cache-reading client view; candidate invariant for V24: "a client view that reads a cache filled by a sibling boundary renders the server's state in its hydration pass").

## Known problems and risks

- `components/board/board.tsx` and `components/notes/notes-provider.tsx` read their caches the same way `useMoney` did, so Home and Notes can hit the same #418 race. Not changed; ask the user.
- The import worker must not touch the DOM: `xlsx.ts` uses no DOMParser by design.
- `numberText` truncates to 15 significant digits: amounts over 10^13 major units would lose digits (none in practice; `parseAmount` still checks safe integers).
- Merging `phase-3/import` after #19 will conflict in `docs/handoff/LATEST.md` only (both branches edit it); take the newer text.

## Next steps (in order)

1. After PR #19 merges: fast-forward main (forged-commit check first), rebase `phase-3/import` on it.
2. Commit the core (user go-ahead), then build the rest of T37:
   - `lib/money/import/worker.ts` (Web Worker, V32): bytes → `sniffSheet` → rows → `readTable` → saved mapping | `detectPreset` | `guessMapping` → `mapRows` → `rowKeys` + `fileKey`; posts preview data back. Check how Next 16 / Turbopack bundles `new Worker(new URL("./worker.ts", import.meta.url))`.
   - Server action `importStatement` (V28, V32): `requireOwner`, account owned, zod; one transaction: insert `import_batch` (unique (user, key) → "already imported on <date>"), insert txns `source='import'`, `external_id` = row key, `on conflict do nothing` on (account_id, source, external_id); return N new / M already present / skipped list. Undo = delete batch (cascade). Demo: device only.
   - Saved mappings: upsert `import_mapping` (user, bank_name) with `columns` = `ColumnMapping`.
   - UI: an Import entry on /money (file → account → preset/mapping editor with live preview: dupes and skipped rows marked, sign check for cards → confirm → result). Destructive-actions memory: undo import gets a confirm or an Undo toast.
   - Recurring suggestions: cards from `detectRecurring` with one-click → subscription (`detectedFromTxn` set by the server), dismiss.
   - Tests: the V32 DB cases (re-import → 0, overlap → 0) at the store level.
3. Close T37 in SPEC (XLSX decision, preset sources, §B entries), hand-off, PR.

## Files to read first

- SPEC.md T37, V12, V24, V25, V27, V28, V32; ADR-0008
- `lib/money/import/mapping.ts`, `presets.ts`, `keys.ts`, `xlsx.ts`
- `lib/money/recurring.ts`, `lib/money/store.ts` (txn writes), `actions/money.ts`
- `lib/db/schema/money.ts` (`importMapping`, `importBatch`, `txn`)

## Env / services touched

- None. No Neon reads or writes. Port 3305 used for zero-env production builds; the user's dev server on port 3000 left alone.

## Review state (two-session model, §10.1)

- PR #19 `phase-3/subscriptions-nits`: https://github.com/kleenpulse/wanheda/pull/19 — Reviewer (wanheda-ad): **LGTM**, no FIXes, no nits (2026-11-05). Checked: editedAnchor candidates (Jan 31 → every 2 months, Feb 29 yearly → monthly, monthly 31st → yearly, future anchor), every useMoney caller in the hydration pass (skeletons, island alerts, palette; no effect or redirect keyed on data), `failed` hidden only in the hydration pass. Both commits author = committer TZ +0100.
- `phase-3/import`: not pushed, not reviewed.
- Nits left open on purpose: #18 nit 2 (watch item).
### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04):
build features; keep tripwire, forged-commit check and CI; one typecheck + test run before a
commit; commit, push and PRs only on the user's word; a short hand-off + continuation prompt
after every PR. No worktrees: branch off main in D:\Vxrcel\wanheda itself. One checkpoint per
session: after its PR merges, stop and hand over. House goal (CLAUDE.md): native-app feel, V24.

Phase 3 CP4: import (SPEC T37), continued. Read docs/handoff/2026-11-05-phase-3-import-core.md
first. The pure core is on branch phase-3/import, UNCOMMITTED (lib/money/import/*,
lib/money/recurring.ts, fflate@0.8.3 in package.json + bun.lock): check `git status` shows it
before anything else. PR #19 (subscriptions nits + React #418 fix) was open at hand-off.

Start: `git fetch`; if #19 merged, check new commits with
`sh scripts/forged-commits.sh 1fa07ab..origin/main` before pulling, fast-forward main, then
bring phase-3/import onto it (stash or commit with the user's go-ahead, then rebase). Then build
the rest of T37 in the order the hand-off lists: worker, server action (one transaction, V32),
saved mappings, preview/confirm UI with undo, recurring suggestions. Bank presets come from
public sources (user's choice); Access and Zenith are PDF-only. Any new package: pinned,
>= 7 days old, supply-chain read first. Any new SQL: generate, show it, apply only on the
user's go-ahead (none expected: the import tables exist in 0004_money.sql).
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only. Lean mode: review when the user asks, one pass per PR, bugs and edge cases only,
verdict LGTM / LGTM with nits / FIX, sent to the Builder. Your LGTM is not the user's approval.
First target: PR #19 (phase-3/subscriptions-nits). Context: docs/handoff/2026-11-05-phase-3-import-core.md,
SPEC.md V24, V30. Look hardest at: editedAnchor in lib/money/subscriptions.ts (candidate search,
the nextOn check, day/week cycles, leap years); useMoney returning null until hydration
(components/money/use-money.ts) — any caller that acts on null data in the hydration pass, and
that hops still paint from cache; RollingNumber's hydration gate.
```
