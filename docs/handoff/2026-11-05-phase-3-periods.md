# Hand-off — Phase 3: Money I — CP2 periods and charts

| | |
|---|---|
| Date | 2026-11-05 |
| Phase / tasks | T35 built and marked `x`; T35b (money outbox) added and decided, not built |
| Branch / PR | `phase-3/periods`, cut from `main` at `d571ecb` in `D:\Vxrcel\wanheda`. Uncommitted at writing; commit, push and PR wait for the user's go-ahead |
| Main | `d571ecb` — Merge pull request #15 (`phase-3/money-core`). `git fetch` at session start found 0 new commits (forged-commit check clean) |
| Previous hand-off | docs/handoff/2026-11-05-phase-3-money-core.md |

## State in one paragraph

`/money` now works on a period: day, week, month or a custom range (up to 366 days), kept in `?p=`. The page sets it against the period before (a running period against the same number of elapsed days), with Spent, Received and Net tiles and change chips. It also has spend-over-time bars, a cumulative "spend so far" line against the previous period, a daily-spend calendar heatmap, totals per category, account or payee as ranked bars that filter the list, a searchable list virtualised past 200 rows, and accounts with balances (add, edit, archive with Undo). No new SQL was needed. The Reviewer (`wanheda-ad`) did one pass at the user's request: one FIX (B14, fixed) and one nit (taken).

## Done this session

- **Start.** `git fetch`: 0 new commits after `d571ecb`, forged-commit check clean; main was already current. Fixed the stale `onDismiss` mention in `LATEST.md` and the CP1 hand-off (user ask).
- **`lib/money/periods.ts`** (29 tests): periods, previous/next, `comparisonOf` (to-date compare, clamped to month end), `?p=` format, labels, buckets (day ≤ 62 d, week ≤ 26 wk, else month).
- **`lib/money/reports.ts`** (10 tests): daily totals, bucket sums, cumulative, `percentChange`, breakdown with children rolled up, heat quartiles, account balance.
- **Server.** `loadMoney` also returns per-account sums before the window (`priorMinor`), so balances need no full history on the device. `loadTxnRange` + `GET /api/money/range` serve periods older than the window. `saveAccount` / `archiveAccount` actions (V28: `setWhere` user; currency fixed after create).
- **Client.** `usePeriod` (URL, no Suspense), `useLedger` (window + older part), range caches patched on writes, `useAccountApi`.
- **UI.** Period bar, tiles with `Delta`, `SpendBars`, `PaceLine`, `SpendHeatmap`, `Breakdown`, `TxnList`, `AccountsCard`. Every chart has a table twin, one tab stop with arrow keys, a tooltip and a screen-reader live readout.
- **Tokens.** `--heat-1..4` in `app/globals.css`: the signal's own hue at fixed OKLCH lightness, so the scale follows any accent the owner picks. It passed the dataviz ordinal validator for six hues in light and three in dark. The first two attempts (mixing toward the surface, then toward white/black) failed the light-end contrast floor and, in Nebula, the single-hue check.

## Decisions made

- **Charts are hand-built SVG, no chart library**: no new packages under the worm rails, and the five forms are small.
- **Ranked bars instead of the FRD's donut/treemap** (dataviz part-to-whole: bars on one baseline compare more exactly; the list carries names and figures). A category bar wears its own colour; account and payee bars, being one series, use the signal.
- **Comparison of a running period** uses the same elapsed days of the previous one (V27 amended).
- **Money outbox: yes, as its own checkpoint (T35b).** Quick-add on a phone with patchy mobile data is the main money use, and today a write is dropped after three retries (about 23 s), which loses a ledger entry. It replaces `createTxnWriter`'s in-memory slots with a persisted per-id queue that keeps V28 and the B13 race tests; ADR-0008 gets amended then. It was kept out of T35 because it rewrites the write path, and T35 is already large.

## Verification (actual results)

- Typecheck clean; Vitest 43 files / 523 tests (after the review fix); tripwire clean; ESLint clean on every touched file.
- Zero-env build passes (`/money` partial prerender, `/api/money/range` dynamic).
- Demo browser run (`next start -p 3105`, Nebula desktop then Ember at 400 px): November spend ₦461,550 equals the hand count of the list and the sum of the breakdown rows; the week view compares Mon–Thu against 26–29 Oct; a custom 30-day range is compared with the 30 days before; bar tooltip by keyboard (Home → ₦394,800 Sun 1 Nov); `?p=` changes without a reload (same a11y uids). Virtual list, run with the threshold lowered to 20 and then restored to 200: rows 40/56 px exactly, holder = 58 × 56 + 28 × 40 px, no gaps mid-scroll. Add account with opening `-12.5k` moved the total by exactly ₦12,500; archive → Undo restored it. 0 console errors.
- **Not run:** owner mode on Neon (balances with real prior sums, `/api/money/range` against real rows). That needs the user's dev server and login.

## Next steps (in order)

1. Reviewer: LGTM on the fix delta (done).
2. The user's go-ahead → commit (stage files explicitly), push, PR.
3. The user tries owner mode: step back to a month before the window (three months back), add an account, archive one.
4. After merge: **stop**. T35b (money outbox) starts in a fresh session from the Builder prompt below.
5. Before T37: ask the user for redacted sample statements from their NG and US banks.

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04):
build features; keep tripwire, forged-commit check and CI; one typecheck + test run before a
commit; commit, push and PRs only on the user's word; a short hand-off + continuation prompt
after every PR. No worktrees: branch off main in D:\Vxrcel\wanheda itself. One checkpoint per
session: after its PR merges, stop and hand over. House goal (CLAUDE.md): native-app feel, V24.

Phase 3 CP2b: the money outbox (SPEC T35b). Read docs/handoff/2026-11-05-phase-3-periods.md,
SPEC.md V23, V24, V28 and B13, ADR-0008, lib/notes/outbox.ts + local-store.ts (the notes
outbox to mirror) and components/money/txn-writer.ts (+ its race tests). Money is integer
minor units + ISO currency (V25); figures only through <MoneyText>.

Start: `git fetch`; check new commits with `sh scripts/forged-commits.sh <T35 merge>..origin/main`
before pulling; fast-forward main. Then `git switch -c phase-3/money-outbox` and move txn
save/delete and account save/archive onto a Dexie outbox: persisted per-id queue, newer write
supersedes an unsent older one, a delete waits for the call in flight, replay is a no-op (client
ids). Undo-delete stays toast-gated (queued only on expire). Port the B13 race tests; SyncChip
counts money ops. Amend ADR-0008 (money joins notes and capture offline). Any new SQL: generate,
show it, apply only on the user's go-ahead.
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only. Lean mode: review when the user asks, one pass per PR, bugs and edge cases only,
verdict LGTM / LGTM with nits / FIX, sent to the Builder. Your LGTM is not the user's approval.
Context: docs/handoff/2026-11-05-phase-3-periods.md, SPEC.md V23, V24, V28, B13, ADR-0008.
Look hardest at: a write queued offline then superseded or deleted before it is sent; a delete
racing a save still in flight (B13); replay after a reload; two tabs sharing the queue; undo
inside the toast window never reaching the server.
```

## Files to read first

- `SPEC.md` §I (P3 CP2 lines), V25, V27, T35, T35b
- `lib/money/periods.ts`, `lib/money/reports.ts`, `components/money/use-money.ts`, `components/money/money-app.tsx`

## Review

- **FIX → B14** (never shipped): a period before the window read every day from its start up to the window, so anything older than about two years hit the route's 732-day cap (400), and a two-month view pulled 21 months and could lose its own oldest rows to the 10k cap. Fixed with `olderRange(from, to, since)`, bounded by the period's end; 3 tests.
- **Nit, taken:** the window read is capped at 5,000 rows; past that, balances came out short with no sign. It now reads one extra row, sets `windowTruncated`, and the page says so. `TXN_LIST_LIMIT` moved to `lib/money/money.ts` so the page and the store share it.
- The delta went back to the Reviewer: **LGTM, no FIXes** (olderRange bounds checked; viewing Sep fetches only Aug; truncation flag checked).

## Gotchas found this session

- A heredoc with a stray `cat > file` before it waits on stdin until the tool times out. Use a script file for multi-line Python edits.
- `next build` and `next start` read `.env.local`; set every gate variable to `""` (as `playwright.config.ts` does) for a zero-env demo run without touching the user's file.
- TypeScript narrows `let x: T | null = null` to `never` inside a loop that assigns it; declare it as `null as T | null`.

## Env / services touched

- None. No Neon reads or writes; demo mode only.
