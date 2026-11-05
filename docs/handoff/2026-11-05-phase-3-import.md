# Hand-off — Phase 3: Money I — CP4 import (T37), PR #20

| | |
|---|---|
| Date | 2026-11-05 |
| Phase / checkpoint | Phase 3 — CP4 import (T37), built; PR #20 open |
| Branch | `phase-3/import` (off main `3fa1a58`) |
| HEAD | `8fd541b` feat: statement import and recurring suggestions (T37), plus this hand-off commit |
| Previous hand-off | docs/handoff/2026-11-05-phase-3-import-core.md |

## State in one paragraph

PR #19 merged as `3fa1a58` (forged-commit check clean on `1fa07ab..origin/main`); `phase-3/import` was moved onto it with a local stash. T37 is built and in PR #20: the import worker, the import page with column editor and preview, the one-transaction server import, saved mappings, undo, and recurring suggestions on Subscriptions. The Reviewer (`wanheda-ad`) sent one FIX (an unbounded bank reference made the row key exceed the schema cap and sank the whole import); fixed, then LGTM. No browser run and no owner-mode import yet. SPEC T37 is not closed: the row and §B entries are drafted (below) and wait for the user's OK.

## Done this session

- **Worker** (`lib/money/import/worker.ts`, `statement.ts`): `readSheet` (sniff → xlsx | html | csv; refuses empty, > 15 MB, PDF, binary .xls), `pickMapping` (saved that fits → preset → guess; a "Column N" saved mapping only fits a headerless file), `analyseStatement` (table, sample, mapping, missing columns, rows + keys, skipped, file key). The worker keeps the last file's cells by `fileId`, so a change of account or column re-maps without re-reading. Typed by hand (`self as unknown as …`): the webworker lib can't load beside the DOM lib.
- **Keys** (`keys.ts`): a unique reference → `ref:` + sha256(day | ref) (review FIX; the day also stops a reused cheque number matching last month). A key that still repeats gets `#n` (a balance column that never moves). Payee cut to `PAYEE_MAX` in `mapRows`, before keying.
- **Server** (`lib/money/import-store.ts`, `actions/import.ts`, `app/api/money/import/route.ts`): `importStatement` checks the account (owned, open), then one `db.batch`: upsert `import_mapping` → insert `import_batch` (mapping id by subquery) → txn inserts in chunks of 500 with `ON CONFLICT DO NOTHING` on (account, source, external_id) → `rows_imported` = count. Same file → "already imported on <date>"; same `batchId` replayed → its own result; a race on the unique key is caught and settled. `undoImport` deletes the batch (txns cascade). `GET /api/money/import` = saved mappings + 20 latest imports; `POST` = file already in? + which keys are present.
- **UI** (`components/money/import/import-app.tsx`, `/money/import`, Import button on Entries): drop zone + account; Columns card (source line, bank name + "remember", bank format select of presets that fit, editor); Rows card (counts, already-imported notice, > 5000 refusal, row table with New / Already here chips, skipped lines, Flip in and out, highlighted for a card account whose rows are mostly money in); done screen; Recent imports with Undo. Undo = inline confirm (destructive-actions rule: cascading delete). Demo: rows go to the cache only; the same file twice is refused per tab.
- **Suggestions** (`components/money/suggestions.tsx` on Subscriptions): `detectRecurring` over the money window; Add → subscription anchored on the latest charge with `fromTxn`; Dismiss → localStorage + Undo toast. `subscriptionWriteSchema.fromTxn` (optional uuid); `saveSubscription` sets `detected_from_txn` on insert only, when that txn is the owner's.
- `toTxn` and `present` exported from `lib/money/store.ts`.

## Verification (actual results)

- `bun run typecheck`: pass. `bun run test`: 52 files / 647 passed on 3 runs; one earlier run had 2 failures I could not capture (58 s against the usual 35 s while another session loaded the machine). Name them if it recurs.
- `bun run tripwire`: clean (also in the pre-commit hook). gitleaks is not installed locally; CI scans.
- ESLint clean on every touched file. `bun run build` passes (normal and zero-env); `/money/import` ◐, `/api/money/import` ƒ; the worker is its own chunk.
- V12 exit cases at the pipeline level (`statement.test.ts`): 2 identical rows → 2 keys; re-download → same file key, 0 new; overlapping statement → only the new days.
- **Not run:** the browser (the DevTools MCP browser was held by another session doing UI work, so the demo server on :3305 was stopped unused), and an owner import against Neon (the DB half of V32 rests on the unique keys).

## Decisions made

- Undo import is an inline confirm, not a toast: it removes many rows and frees the file key (memory: cascading deletes are confirmed).
- The check before confirm is a `POST` route, not an action: it is a read, and the keys don't fit a URL.
- Every row is sent on confirm, not only the "new" ones: the DB decides, so a stale check can't drop or double a row.
- Dismissed suggestions live on the device (localStorage), no new SQL.

## Bugs found

- Review FIX: an unbounded reference made `ref:<raw>` longer than the 100-char key cap → zod refused the whole write. Fixed (hashed). The old key format never reached Neon.

## Known problems and risks

- Another session was editing UI at the same time (shell layout, globals.css, dock, nav rail, menu, txn-form, notes-app, and the Timeline rail in `components/money/subscriptions.tsx`). None of it is in this branch's commits; it is still uncommitted in the working tree. Stage by hunk if you touch those files.
- `docs/handoff/2026-11-05-phase-3-import-core.md` was committed with this hand-off.
- Suggestions only see the money window (this month and the two before), so a monthly charge needs 3 hits in that window. Enough for T39's "3 months imported".
- Home and Notes caches can still hit the #418 race (`board.tsx`, `notes-provider.tsx`); not changed; ask the user.

## Drafted for SPEC (needs the user's OK, then the spec skill applies it)

- T37 → `x` with build notes (above), XLSX = `fflate@0.8.3` + own reader, presets from public sources (Access, Zenith PDF-only; Moniepoint, BofA card, Capital One 360 unverified), owner run not done.
- B15: React #418 on money pages = hydration-order race (sibling `Prefetch` filled the cache before the view's hydration pass) + `RollingNumber` reading reduced motion on first render → V24: a client view that reads a cache a sibling boundary fills renders the server's state in its hydration pass.
- B16: subscription edit re-anchored on the shown (clamped) renewal → month-end drift (V30) → `editedAnchor`.
- B17: import ref key unbounded (review FIX, ⊥ shipped) → V12: row keys fixed length.

## Next steps

1. User merges PR #20 (after CI). Then stop: the next checkpoint starts in a new session.
2. Owner check of import: a real statement into a real account; same file again → "already imported"; an overlapping one → only new rows; undo → rows gone and the file key free.
3. Apply the SPEC draft on the user's OK.
4. Next: T38 (budgets, rules, FX, privacy mode, Home widgets, export).

## Review state

- PR #20 `phase-3/import`: https://github.com/kleenpulse/wanheda/pull/20 — Reviewer (`wanheda-ad`): FIX (ref key length) → delta → **LGTM**. Commits: author = committer TZ +0100.

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04):
build features; keep tripwire, forged-commit check and CI; one typecheck + test run before a
commit; commit, push and PRs only on the user's word; a short hand-off + continuation prompt
after every PR. No worktrees: branch off main in D:\Vxrcel\wanheda itself. One checkpoint per
session: after its PR merges, stop and hand over. House goal (CLAUDE.md): native-app feel, V24.

Read docs/handoff/2026-11-05-phase-3-import.md first. PR #20 (T37 import) was open at
hand-off. Start: `git fetch`; check new commits with `sh scripts/forged-commits.sh
3fa1a58..origin/main` before pulling; fast-forward main. Another session was making UI
changes in the working tree: check `git status` and leave its files alone unless the user says.
If the user OKs the SPEC draft in the hand-off, apply it with the spec skill. Then Phase 3 CP5:
T38 (budgets + 80/100 % alerts, rules, FX daily + base-currency picker, privacy mode, Home money
widgets, export) on branch phase-3/budgets-fx. Any new package: pinned, >= 7 days old,
supply-chain read first. Any new SQL: generate, show it, apply only on the user's go-ahead.
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only. Lean mode: review when the user asks, one pass per PR, bugs and edge cases only,
verdict LGTM / LGTM with nits / FIX, sent to the Builder. Your LGTM is not the user's approval.
Target: the post-push / post-merge check of PR #20 (phase-3/import), then the next T38 PR.
Context: docs/handoff/2026-11-05-phase-3-import.md, SPEC.md V12, V24, V28, V32.
```
