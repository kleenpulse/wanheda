# Hand-off: money inputs with brains (T68)

| | |
|---|---|
| Date | 2026-11-07 |
| Phase / checkpoint | Phase 3 follow-up, `feat/money-input` (T68) |
| Branch | `feat/money-input` (off `main` at `4e3c6f9`) |
| HEAD | `4e3c6f9`, Merge pull request #53 (the work is uncommitted on top) |
| Previous hand-off | docs/handoff/2026-11-07-phase-7-music-player.md |

## State in one paragraph

T68 is built and waiting for the Reviewer (`wanheda-5f`). The user asked to "give all money input boxes brains" after Add account took `20ksfjfbjs` as an opening balance. All five money fields (entry amount, opening balance, budget, subscription charge and goal target) now share one brain. A field only takes what can be part of an amount and adds commas as you type. It reads short forms and sums, shows "= ₦3,300" under the field, and writes the plain amount on blur or Enter. Paste cleaning, arrow-key steps and a ± button for the opening balance are in too. Main was verified at the start of the session, #53's main check is closed, and the merged local branches are deleted.

## Done

- `lib/money/amount-input.ts` (pure) and `lib/money/amount-input.test.ts` (66 tests).
- `components/money/money-input.tsx`: `useMoneyField`, `MoneyInput`, `MoneyNote`.
- Wired into `txn-form.tsx`, `accounts.tsx` (`parseOpening` removed), `budgets.tsx`, `subscriptions.tsx` and `income/goals-view.tsx`.
- CHANGELOG (Unreleased → Changed) and SPEC T68 are written.
- Gates: tripwire clean, typecheck 0, lint clean on the touched files, 1361/1361 tests, prod build OK.
- Browser (demo, prod build on :3043, Chrome via Playwright): 21/21 checks across all 5 forms, light and dark, phone width, 0 page errors. The script is in that session's scratchpad (`money-check.ts`).

## Choices made (flagged to the Reviewer)

- The ± button shows on every screen size when negatives are allowed, not only on phones.
- The `-` key types a minus; it doesn't flip the sign, so sums still work.
- There is no native Ctrl+Z after the field rewrites its text (the input is controlled).
- A bare number with too many decimals is an error ("Only 2 decimals in NGN"), while a sum such as `100/3` is rounded half away from 0.
- `parseAmount` is unchanged; import mapping and quick-add still use it.

## Next

1. Wait for wanheda-5f's verdict. On LGTM: commit (stage files explicitly), push and open the PR (memory: PR after peer LGTM). The user merges.
2. Then T65, the Phase 7 exit run, in a fresh session.

## Notes

- The user's own `next dev` was running on :3000 (gated). I left it alone; browser checks used `next start` on :3043 with demo env.

## Update: review and island gap

- wanheda-5f: **LGTM with nits**, no FIXes. All 4 nits taken:
  1. Inserts are told from deletes by `inputType`, so typing over a selection is guarded too.
  2. JPY takes up to 3 decimals while typing, so `2.5k` works; a bare `2.5` is an error on blur.
  3. A junk paste (`1e5`) is kept as pasted and reads "Not an amount" (`hasJunk`).
  4. A leading `.` (`.5`) works.
- The user asked for space between the island and the tabs row. A first pass (`pt-14` on the whole header) moved the title and the eye too, which the user rejected. Now only the tabs move: the PageFrame `actions` wrapper is `@4xl/frame:translate-y-5.5` (tabs 52–92, 8 px under the island), and below @4xl the title goes full width so the tabs and eye take their own line, with no shift. Pages without actions are unchanged. Checked at 1440, 1200, 1050, 1024, 900 and 390 on Money, Income and Notes.
- Gates after both: 1364/1364 tests, typecheck 0, lint clean, tripwire clean, build OK, browser 24/24 (the one script miss expected `0.5`; the field rightly shows `0.50`).
