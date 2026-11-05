# Hand-off — Phase 3: Money I — CP2b money outbox (+ analytics page)

| | |
|---|---|
| Date | 2026-11-05 |
| Phase / tasks | T35b built and marked `x`; `/money` split into Entries and Analytics (user asks, same branch) |
| Branch / PR | `phase-3/money-outbox`, cut from `main` at `cef4d98` in `D:\Vxrcel\wanheda`. Commits `2094b0f` (analytics split), `b728a8c` (day cards), `22fcea7` (outbox), pushed and PR #17 opened 2026-11-05 on the user's go-ahead |
| Main | `cef4d98` — Merge pull request #16 (`phase-3/periods`). `git fetch` at session start: 4 new commits `d571ecb..cef4d98`, forged-commit check clean, main fast-forwarded |
| Previous hand-off | docs/handoff/2026-11-05-phase-3-periods.md |

## State in one paragraph

Money writes no longer get dropped. Every txn save or delete and every account save or archive goes into a Dexie outbox (`wanheda-money`) first, then out in order, one at a time across tabs, until the server answers. A network failure, timeout or lost session keeps the op and retries forever; only a refusal drops it, with a toast. A newer save or a delete replaces unsent saves of that txn; a save that was sent without an answer goes first, since it may have landed. The in-memory `txn-writer.ts` and its tests are gone; the B13 races are ported to the outbox, plus reload, two-tab and undo cases. Also this session, on the user's asks: the entries list moved above the charts, then the charts and breakdown moved to their own page `/money/analytics`, with Entries | Analytics tabs at the header's right end, a breakdown row opening the entries filtered (`?f=`), and compact totals tiles on phones. No new SQL, no new packages.

## Done this session

- **Start.** Forged-commit check on `d571ecb..origin/main` clean (4 commits); main fast-forwarded to `cef4d98`; branch `phase-3/money-outbox`.
- **Analytics split** (commit `2094b0f`, pushed): `app/(shell)/money/layout.tsx` (frame, Prefetch, `MoneyTabs` in `actions`), `/money` = tiles → entries + Add/Accounts, `/money/analytics` = tiles → charts + breakdown; `lib/money/list-filter.ts` (`?f=by:key`, 2 tests); `useListFilter`, `entriesHref`, `usePeriodParam` in `use-period.ts`; `normalPayee` shared; tiles one short row under `@xl`. Day cards (`b728a8c`): each day in the entries list is its own card again with a 16 px gap (the T34 look), the virtual list windows whole days (offsets measured = formula).
- **Outbox.** `lib/money/outbox.ts` (ops, `supersedes`, `MemoryMoneyStore`, `MoneyOutbox`, result types the actions now re-export), `lib/money/local-store.ts` (Dexie, every step one transaction), `components/money/money-runtime.ts` (overlay of txns and accounts, answered ops folded into the cache in every tab, BroadcastChannel for queued and answered ops, boot replay), `components/money/money-provider.tsx` (mounted in `shell-frame.tsx` next to `NotesProvider`), `use-money.ts` rewired, `SyncChip` sums notes and money.
- **Docs.** SPEC V28 (client rule), I line P3 CP2b, T35b `x`, B13 note; ADR-0008 amended; `docs/CONTEXT.md` Outbox.

## Decisions made

- **One queue for txns and accounts**, not per id: a txn on a just-created account must land after the account, and a single in-flight op across tabs is the simplest proof that a delete never overtakes a save (B13).
- **Account ops never supersede or get superseded**: they are rare, and dropping an unsent account create could strand a txn queued after it.
- **No conflict handling for money** beyond last write wins per row (ADR-0008 amendment): one owner, small rows.
- **Two outboxes share a shape, not code.** Extract a shared queue core when a third module goes offline (noted in ADR-0008).
- **Undo of a still-queued quick-add** shows the local copy again (the old code would have made the row vanish until the save landed). A save answer never unhides a row hidden by a running undo toast.

## Verification (actual results)

- Typecheck clean; Vitest 45 files / 539 tests (old writer's 8 removed; runtime 18 + queue 4 + filter 2 added); ESLint clean on every touched file; tripwire and forged-commit check clean on all three commits. gitleaks is not installed locally: CI scans.
- Zero-env build passes (`/money` and `/money/analytics` partial prerender).
- Demo browser run (Nebula desktop, Ember desktop and 380 px phone): tabs carry `?p=`, hop stays in the same document, breakdown Food & drink → 26 of 61 entries = its row, Back/forward/clear; form add +₦4,500 to Spent, delete → Undo → back, delete → expiry → gone and total restored; add account with `-12.5k` → total −₦12,500, archive → Undo → back; 0 console errors.
- **Not run:** owner mode. The Dexie store and the real server path are untested in a browser (demo never queues). Needs the user's dev server and login. (1) DevTools offline → add 2 entries → chip "Offline · 2 waiting" → online → both on Neon. (2) Offline → add 1 → close the tab → back online, reopen `/money` → it shows at once and lands (replay from Dexie; a cold reload while offline needs a service worker, which there isn't). (3) Offline → delete a row, let the toast run out → online → gone on Neon. (4) Two tabs → add in one → the other shows it.

## Next steps (in order)

1. Done: committed, pushed, PR #17 "Money outbox and analytics page (T35b)" (user's go-ahead).
2. Reviewer pass if the user wants one (prompt below).
3. User: owner check (steps above), then merge.
4. After merge: **stop**. T36 (subscriptions) starts in a fresh session from the Builder prompt below.
5. Before T37: ask the user for redacted sample statements from their NG and US banks.

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04):
build features; keep tripwire, forged-commit check and CI; one typecheck + test run before a
commit; commit, push and PRs only on the user's word; a short hand-off + continuation prompt
after every PR. No worktrees: branch off main in D:\Vxrcel\wanheda itself. One checkpoint per
session: after its PR merges, stop and hand over. House goal (CLAUDE.md): native-app feel, V24.

Phase 3 CP3: subscriptions (SPEC T36). Read docs/handoff/2026-11-05-phase-3-money-outbox.md,
SPEC.md T36, V24-V31, ADR-0008 (money writes go through the outbox: components/money/money-runtime.ts,
lib/money/outbox.ts), and the money layout (app/(shell)/money/layout.tsx: Entries | Analytics
tabs). Money is integer minor units + ISO currency (V25); figures only through <MoneyText>.

Start: `git fetch`; check new commits with `sh scripts/forged-commits.sh cef4d98..origin/main`
before pulling; fast-forward main. Then `git switch -c phase-3/subscriptions`. Subscription
writes join the money outbox as new op kinds (same queue, so a subscription on a new account
lands after it). Decide where subscriptions live in the money tabs. Any new SQL: generate, show
it, apply only on the user's go-ahead.
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only. Lean mode: review when the user asks, one pass per PR, bugs and edge cases only,
verdict LGTM / LGTM with nits / FIX, sent to the Builder. Your LGTM is not the user's approval.
Context: docs/handoff/2026-11-05-phase-3-money-outbox.md, SPEC.md V24, V28, B13, ADR-0008.
Look hardest at: lib/money/outbox.ts supersede rule and drain loop; lib/money/local-store.ts
transactions and the persisted inFlight marker after a tab dies mid-send; money-runtime.ts
overlay settling (settleTxn, unhideTxn) against the undo toast; cross-tab BroadcastChannel
messages; the /money/analytics split (?p= and ?f= handling, Back).
```

## Files to read first

- `lib/money/outbox.ts`, `components/money/money-runtime.ts`, `components/money/money-runtime.test.ts`
- `app/(shell)/money/layout.tsx`, `components/money/money-app.tsx`

## Gotchas found this session

- Node has `navigator.locks`: a runtime test that leaves a send unanswered holds a real Web Lock and stalls every later test. Tests pass their own lock.
- The stray-`cat` heredoc trap from the last hand-off bit again (a `cat > /dev/null;` before `python - <<'PY'`): use a script file.
- A drain resends a tried op at the next flush (any new write triggers one), not only when the retry timer fires.

## Env / services touched

- None. No Neon reads or writes; demo mode only.
