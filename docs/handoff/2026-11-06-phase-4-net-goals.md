# Hand-off — Phase 4 CP4: net view, goals, income alerts on the island (T43)

| | |
|---|---|
| Date | 2026-11-06 |
| Phase / checkpoint | Phase 4 CP4, T43 `phase-4/net-goals`. Built; Reviewer wanheda-e9: LGTM with nits (no FIXes), both nits taken ⇒ committed, pushed, PR opened; merged on green checks under the overnight order |
| Branch | `phase-4/net-goals` (off main `be7c238`; PR #27 (T42) merged under the user's overnight order; forged-commit check on `af04f43..origin/main` clean, 2 commits) |
| Previous hand-off | docs/handoff/2026-11-05-phase-4-income-dashboard.md |
| Standing order tonight | User (2026-11-05, going to bed): loop "answer questions yourself → peer review → LGTM → PR → checks green → merge → next task → repeat". `db:migrate` is still the user's. |

## State in one paragraph

T43 is built, reviewed (LGTM with nits, both taken) and committed. Income is now three pages under one layout: Products (T42), Net and Goals. The tabs are a shared `RouteTabs`, which Money's tabs now use too. Net and Goals read the money cache, with their own Money `Prefetch` in Suspense. Goals ride in the income payload. No new SQL: the `goal` table is in `0006_saas`, applied in T40. No new dependency.

## Decisions taken without the user (overnight order: answer questions yourself)

1. **Runway** = cash ÷ average *spending* over the last 3 full months that have any entry. Spending rather than net burn: it says how long the cash lasts if income stopped. A month with no entries at all is left out, not counted as ₦0 spent; that ₦0 stretched the demo's runway before the fix.
2. **Save goals track cash**: the open accounts' balances, converted to the goal's currency. The value 90 days ago = now − (income − spending since).
3. **MRR goals** count MRR in the goal's currency only, for one product or all. MRR in other currencies is never converted in.
4. The form requires a **due date**. The schema still allows null, and a goal without one shows progress only.
5. **Island income alerts** are unread `income` notices raised in the last 48 h. The island's Open button marks the notice read before opening Income; Dismiss marks it read.

## Done this session

- **`lib/money/net.ts`** (pure): `monthsTo`, `netByMonth` (V26 `convertedTotals`, this month counted up to today), `cashIn` and `runwayMonths`.
- **`lib/saas/goals.ts`** (pure): the `Goal` type and strict `goalWriteSchema`. `goalProgress` returns reached, on-track, behind, missed or open. The projection is current + (current − 90 d ago) × days left ÷ 90, rounded half-even once. Plus `sortGoals`.
- **Store:** goals are added to `loadIncome`. `saveGoal` upserts by the client's id; its `setWhere` stops it touching another user's row, and it checks the product is the owner's. Plus `deleteGoal`, and `actions/goals.ts` with `requireOwner` first; demo gets `demo`.
- **`useGoalApi`:** writes go into `INCOME_KEY` at once, cancelling any refetch in flight. A failed save puts the goal back and shows a toast. A delete is hidden until the Undo toast runs out.
- **UI:**
  - `NetView`: tiles for net, savings rate, cash and runway, and `NetBars` (income up, spending down, a net tick). SaaS revenue has its own card and a table column marked "not added".
  - `GoalsView`: cards with progress and a status (icon plus word), and a form in a `GrowDialog`.
- **Island `saas-alert`:** `lib/saas/saas-alerts.ts` plus `components/island/saas-alert-activity.tsx`. `INCOME.activities` is now `["saas-alert"]`. The demo seed has one sample income notice, so the island shows it.
- **Palette:** "Open net income and runway" and "Open goals".

## Review (wanheda-e9, one pass)

LGTM with nits, no FIXes. Both nits taken:
1. **A savings goal's "cash 90 days ago" misses balance changes that aren't flows:** a one-legged move to an untracked account, an edited opening balance, FX drift. Fine as a v1; the goals page now says so in its intro line.
2. **A refetch that starts after an optimistic save, before the server answers, briefly dropped the new goal.** Fixed: saves in flight are kept in a pending overlay (`useLocal` in `use-goals.ts`) and laid over the cache until the server answers.

## Verification (actual results)

- `bun run typecheck`: pass.
- `bun run test`: 82 files, 872 passed. New: net 7, goals 8, saas-alerts 2. The demo-notices test now expects 2 unread.
- `bun run tripwire`: clean.
- ESLint on touched files: clean.
- **Demo browser run** (zero-env dev server):
  - Net: tiles and chart render; SaaS revenue ($48) sits beside, not added.
  - Goals: behind, on track and reached all render.
  - Adding a goal through the form lists it in due-date order; deleting hides it, and Undo brings it back.
  - The island rotates to "New customer, Sample: rawstash".
  - No console errors.
- Not run: `bun run build` (CI builds), and an owner run against Neon. Saving a goal to the real database hasn't been exercised.

## Not done / open

1. **T44 (Phase 4 exit) needs the user:** a Polar token with `metrics:read` on the real organization, then compare Polar's MRR with Wanheda's on the same day. The loop stops after T43 for this.
2. An owner run of goals against Neon (save, edit, delete).
3. Carried over: hidden Home widgets keep their old privacy mask until shown; `weather-widget.tsx` has a pre-existing lint error; `app/globals.css` is another session's edit, left out.

## Files for the commit (stage by name)

`SPEC.md`, `actions/goals.ts`, `app/(shell)/income/layout.tsx`, `app/(shell)/income/page.tsx`, `app/(shell)/income/net/page.tsx`, `app/(shell)/income/goals/page.tsx`, `components/income/charts/net-bars.tsx`, `components/income/goals-view.tsx`, `components/income/income-app.tsx`, `components/income/income-tabs.tsx`, `components/income/net-view.tsx`, `components/income/parts.tsx`, `components/income/use-goals.ts`, `components/island/island.tsx`, `components/island/money-alert-activity.tsx`, `components/island/saas-alert-activity.tsx`, `components/money/money-tabs.tsx`, `components/shell/command-palette.tsx`, `components/shell/route-tabs.tsx`, `lib/modules.ts`, `lib/money/net.ts`, `lib/money/net.test.ts`, `lib/notifications/notifications.ts`, `lib/notifications/notifications.test.ts`, `lib/saas/goals.ts`, `lib/saas/goals.test.ts`, `lib/saas/income.ts`, `lib/saas/income-server.ts`, `lib/saas/saas-alerts.ts`, `lib/saas/saas-alerts.test.ts`, `lib/saas/seed.ts`, `lib/saas/store.ts`, this hand-off and `docs/handoff/LATEST.md`. **Not** `app/globals.css`.

## Next steps (in order)

1. Done: Reviewer LGTM with nits (taken); committed, pushed, PR opened; merge on green checks (overnight order).
2. Stop the loop: T44 needs the user (real Polar organization, metrics token). Write the hand-off for the user's morning.

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04,
tightened 2026-11-05): build features; tests only where they guard real logic or a spec exit
case; keep tripwire, forged-commit check and CI; one typecheck + test run before a commit;
after the Reviewer peer's LGTM (or LGTM with nits) commit, push and open the PR without asking
(user 2026-11-05); merge and db:migrate stay the user's unless the user has said otherwise for
the session. A short hand-off + continuation prompt after every PR. No worktrees. House goal
(CLAUDE.md): native-app feel, V24.

Read docs/handoff/2026-11-06-phase-4-net-goals.md first. T44 (Phase 4 exit) needs the user:
a Polar organization access token with metrics:read; connect, map products, Sync now, then
compare Polar's MRR to Wanheda's /income parity card on the same day. Run the other T44 exit
checks (same webhook 3x = no change; refund before payment; rebuild = same numbers) against
the owner's data with the user, then write the Phase 4 done hand-off with Phase 5 prompts.
Leave app/globals.css out. Never bunx an unpinned tool.
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only. One pass, bugs and edge cases only, verdict LGTM / LGTM with nits / FIX, sent to the
Builder. Your LGTM is not the user's approval.
Target: the T43 diff on phase-4/net-goals (uncommitted). Riskiest: money never summed across
currencies (netByMonth/cashIn convert per V26, missing rates kept apart; MRR goals one currency);
goalProgress projection maths and statuses; saveGoal ownership (setWhere user, product owned);
optimistic goal writes vs a background refetch; undo-delete only on expiry; runway's month
filter; island alert window (48 h, unread, V37 keys); V24 (no skeleton on a hop between the
income pages; money Prefetch in Suspense).
Context: docs/handoff/2026-11-06-phase-4-net-goals.md.
```
