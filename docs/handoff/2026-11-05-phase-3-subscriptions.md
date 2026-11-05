# Hand-off — Phase 3: Money I — CP3 subscriptions

| | |
|---|---|
| Date | 2026-11-05 |
| Phase / tasks | T36 built and marked `x` |
| Branch / PR | `phase-3/subscriptions`, cut from `main` at `c37937e` in `D:\Vxrcel\wanheda`. Commit `d07d237`, pushed and PR #18 "Subscriptions (T36)" opened 2026-11-05 on the user's go-ahead |
| Main | `c37937e`: Merge pull request #17 (`phase-3/money-outbox`). `git fetch` at session start: 5 new commits `cef4d98..origin/main`, forged-commit check clean, main fast-forwarded |
| Previous hand-off | docs/handoff/2026-11-05-phase-3-money-outbox.md |

## State in one paragraph

Subscriptions are a third money tab, `/money/subscriptions`, on the same layout, cache and Prefetch as Entries and Analytics. Tiles show the cost per month and per year (one total per currency, summed exactly and rounded once, V26) and the next renewal. Below them, "What you pay for" lists the active ones by monthly cost, and an "Upcoming" timeline covers the next 60 days. Add, edit, pause, resume, cancel (with Undo) and delete (with Undo) all go through the money outbox as two new op kinds, `sub-save` and `sub-delete`, in the same queue, so a subscription on a new account lands after the account. Reminders (V31) are `notification` rows with dedupe keys. They are raised when the owner's shell loads, alongside the notices read, and after a save, which returns them to the centre at once. The island shows a `money-alert` for each unread reminder until it is dismissed or its day passes. The palette has "New subscription" and "Open subscriptions". No new SQL: the `subscription` table has been in `0004_money.sql` since T34, and `notification.kind` is free text.

## Done this session

- **Start.** Forged-commit check on `cef4d98..origin/main` clean (5 commits); main fast-forwarded to `c37937e`; branch `phase-3/subscriptions`.
- **Pure core.** `lib/money/subscriptions.ts` (types, strict write schema, schedule from the anchor, costs, ranking, timeline, alerts) with 24 tests. `lib/money/convert.ts`: exact bigint fractions, half-even rounding; `currency.ts` already named it as the only home for × and ÷ on money. `dates.ts`: `addMonthsClamped`, `monthsBetween`.
- **Server.** `store.ts` loads subscriptions with the window (same batch), plus `saveSubscription` (account and category must be the owner's), `deleteSubscription` and `loadAlertFacts`. `lib/money/alerts.ts` `raiseMoneyAlerts` (never throws). Actions `saveSubscription` and `deleteSubscription`, with tests. `lib/notifications/store.ts` `addNotices` (bulk, once per key, returns new and existing rows).
- **Client.** Outbox op kinds and supersede rule (a save or delete drops an unsent save of the same subscription, like txns), runtime overlay `subs`, `useSubscriptionApi`, `useNewSubscription` (palette intent). Runtime tests: account then subscription order plus notices pushed, supersede then delete, undo of a queued save, refusal.
- **UI.** `components/money/subscriptions.tsx`, `components/island/money-alert-activity.tsx`, the third tab, palette commands, the centre's `money` icon. `PageFrame`'s header now wraps, so on a phone the money tabs drop under the title instead of squeezing it and sliding under the island.
- **Demo.** The seed has 8 subscriptions: the card's three monthly charges on the same days as the seed txns, a gym due in 2 days, a trial ending in 3, a yearly domain, one paused and one cancelled. Demo's notification centre carries their reminders.
- **Docs.** SPEC: new I line (P3 CP3), V28 (subscriptions in the queue), V31 (delivery decision), T36 `x`. ADR-0008 amendment line. `docs/CONTEXT.md`: Subscription (the anchor) and Reminder.

## Decisions made

- **Subscriptions live in a third tab**, not inside Entries or Analytics. They have no period, so the period bar and the period tiles don't apply. They share the layout, so a hop between tabs paints from the cache.
- **Delivery = owner read only; no daily cron for now.** With no push channel (web push or desktop), a reminder raised while no app is open would still only show at the next load, and that load runs the same check. Revisit with web push or the desktop shell. Recorded in V31.
- **Reminder text has dates, not amounts.** "Netflix renews Sun 8 Nov" stays true in the centre. Amounts would bypass `<MoneyText>` and privacy mode (V25). The island card shows the amount through `<MoneyText>` when the money cache is on the device.
- **A renewal on or before the trial's end raises only the trial reminder**, so the usual "trial ends and first charge on the same day" does not alert twice.
- **Editing keeps the anchor** unless the renewal date, the cycle or the count is changed. The form shows the next renewal, and saving that unchanged would move a 31st anchor to the 30th.
- **The paid-from account doesn't set the currency on an edit**: a dollar subscription can be paid from a naira account. On a new one, picking an account sets its currency while the amount is still empty.
- **No logo field in the UI** (FR-MONEY-8 lists one). External images would leak requests to third parties; the category mark stands in. The column stays.

## Verification (actual results)

- Typecheck clean; Vitest 46 files / 571 tests (24 subscription, 1 outbox, 4 runtime, 3 action tests added; notice fixtures gained `dedupeKey`); ESLint clean on every touched file; tripwire clean.
- Zero-env `bun run build` passes; `/money/subscriptions` is a partial prerender like its siblings.
- Demo browser run (production build, port 3305, env vars blanked so `.env.local` is not read): Nebula 1440, Ember light 1280, 390 px phone. Totals checked by hand: $15.49 + $11.99 + $20 + $15 + $1.50 = $63.98 a month, $767.76 a year, ₦25,000 × 12 = ₦300,000. Pause Netflix: 5 active, −$15.49, gone from the timeline and the island. Add ₦4,500 every 3 months: ₦1,500/mo, totals ₦26,500 and ₦318,000. Delete, then Undo: back. Island card: Open and Dismiss (bell 4 → 3, island 3 → 2). Palette from Home → "New subscription" → lands on the page with the form open and the name focused; Escape closes it for good; Add still works. Design self-check passed after adding `tabular` to dates and counts, and replacing an amber "due soon" line that measured about 3.7:1 in Ember light.
- Console: one React #418 hydration error (×2) showed once, on the reload straight after a rebuild. It did not come back in 6 later fresh loads (light, dark, `/`, `/money`, `/money/subscriptions`). Watch for it.
- **Not run: owner mode.** Needs the user's dev server and login. (1) Add a subscription renewing in 2 days → the reminder appears in the bell and the island without a reload. (2) Reload → still one notice (dedupe). (3) Offline → add one on a brand-new account → online → both on Neon, account first. (4) Pause it → its island alert goes. (5) Neon read-only: `subscription` rows have the user's id, `detected_from_txn` false, and `notification` has one row per `sub:<id>:<day>:renew|trial` key.

## Next steps (in order)

1. Done: commit `d07d237`, pushed, PR #18 (user go-ahead, 2026-11-05).
2. Reviewer pass if the user wants one (prompt below).
3. User: owner check (steps above), then merge.
4. After merge: **stop**. T37 (import) starts in a fresh session. Before it starts, ask the user for redacted sample statements from their NG and US banks.

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04):
build features; keep tripwire, forged-commit check and CI; one typecheck + test run before a
commit; commit, push and PRs only on the user's word; a short hand-off + continuation prompt
after every PR. No worktrees: branch off main in D:\Vxrcel\wanheda itself. One checkpoint per
session: after its PR merges, stop and hand over. House goal (CLAUDE.md): native-app feel, V24.

Phase 3 CP4: import (SPEC T37). Read docs/handoff/2026-11-05-phase-3-subscriptions.md, SPEC.md
T37, V12, V25, V27, V28, V32, ADR-0008, and lib/money/subscriptions.ts (recurring detection
ends in a subscription with detected_from_txn). First ask the user for redacted sample
statements from their NG and US banks; build the generic mapper first if they aren't ready.

Start: `git fetch`; check new commits with `sh scripts/forged-commits.sh c37937e..origin/main`
before pulling; fast-forward main. Then `git switch -c phase-3/import`. Any new package: pinned,
>= 7 days old, supply-chain read first. Any new SQL: generate, show it, apply only on the
user's go-ahead.
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only. Lean mode: review when the user asks, one pass per PR, bugs and edge cases only,
verdict LGTM / LGTM with nits / FIX, sent to the Builder. Your LGTM is not the user's approval.
Context: docs/handoff/2026-11-05-phase-3-subscriptions.md, SPEC.md V25, V26, V28, V30, V31.
Look hardest at: lib/money/subscriptions.ts firstIndexFrom and month-end clamping; costTotals
rounding once per currency; the form keeping the anchor on edit (components/money/subscriptions.tsx
submit); sub ops in lib/money/outbox.ts supersedes and money-runtime.ts settleRow/unhideRow;
raiseMoneyAlerts in the shell layout (never throws, merged with the notices read); the island
alert dropping paused, cancelled or deleted subscriptions; the PageFrame header wrap on other pages.
```

## Files to read first

- `lib/money/subscriptions.ts`, `lib/money/convert.ts`, `lib/money/alerts.ts`
- `components/money/subscriptions.tsx`, `components/island/money-alert-activity.tsx`

## Gotchas found this session

- The user's own `next dev` was running on port 3000, and Next 16 allows one dev server per folder. Demo checks ran on a zero-env production build with `next start -p 3305` instead. Blank env vars (`DATABASE_URL= … bun run start`) keep `.env.local` out, since `@next/env` never overrides a variable that is already set, even to empty.
- Bash heredocs whose text holds an apostrophe failed in this shell wrapper ("unexpected EOF while looking for matching `'`") even with a quoted delimiter. Write Python edit scripts to the scratchpad with the Write tool.
- The island pill swaps every few seconds, so a DevTools `click` by uid times out; click it from `evaluate_script`.
- React Compiler lint flags `Date.now()` inside an event handler defined in render, and `setState` in an effect. Move the call to a module function, and derive the "open" state from the store instead of syncing it.

## Env / services touched

- None. No Neon reads or writes; demo mode only. The user's dev server on port 3000 was left alone.

## Addendum: billing cycle card (same session, user asks)

- `components/money/renewal-cycle.tsx` `RenewalCycle`, above Upcoming in the right column. One active subscription: the card itself is a liquid tank ported from deep-ellum `src/components/miscellaneous/liquid-progress.tsx` (the user corrected the source: not Ellum-FE stats-cards). Canvas liquid rises from the card's foot to the cycle share on arrival, its surface rolling on two sine waves, under a gloss; it halts off screen (IntersectionObserver), in a hidden tab, and under reduced motion. Duo-tone: `bg-signal-soft` card, signal liquid (pale in light themes, so ink reads on it at >= 4.5:1). User rules: text black or white only, no dots, and split per pixel along the surface like caishen_landing's hero. Caishen does it with six stacked blend layers (difference, color, overlay x4); ported faithfully, that fringed small text blue at anti-aliased edges (3x zoom), so the card uses two solid copies of the words (`text-foreground`, and `text-inverse-foreground` for the copy on the liquid), the second clipped every frame to the wave path the canvas fills (`clip-path: path()`). Light themes deepen the liquid so white reaches >= 4.5:1. The scroll-docking sidekick of the original was left out. Two or more: canvas rings (the most expensive outside, the data palette by rank, colours read from tokens at runtime via `resolveColors` in `lib/prefs/wallpaper-palette.ts`). They fill in once on arrival, then the loop stops. Reduced motion draws everything in place and drops the glint.
- A first version had a 30-day time-lapse (Play/Pause, scrubber, dial, sparks, charged-by tally). The user removed the controls row, so the time-lapse went with it.
- A cycle runs to the next renewal: on renewal day it is full and due Today (`renewalsAround(sub, yesterday, yesterday)`), like the rest of the page. `renewalsAround` is in `lib/money/subscriptions.ts`, with a test.
- User rule (saved to memory): no borders, use duo-tones. The bar track and the Trial chip are tints now. Form fields keep the shared house ring; changing those is an app-wide call for the user.
- **Open: React #418 hydration error** on `/money/subscriptions`, intermittent (about 1 in 3 reloads) under DevTools mobile + touch + reduced-motion emulation; `/money` was clean in 3 reloads under the same emulation. It happened before and after the Play button was removed, so the cause lies elsewhere on the page. The production build hides the mismatching node, and the dev server on port 3000 belongs to the user. Next step: a dev run, once the user stops theirs or allows a second checkout, to read the full message.
- Verification: typecheck, Vitest 46 files / 572 tests, ESLint on touched files, tripwire clean; demo build checked in Nebula and Ember for 6 rings and for 1 (liquid bar, glint measured sweeping -65 px to 262 px, rest 3 s).
