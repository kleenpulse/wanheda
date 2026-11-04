# Hand-off — Phase 1: The shell and the island — prefs and notification centre (T27)

| | |
|---|---|
| Date | 2026-11-04 |
| Phase / tasks | Phase 1, SPEC T27 (prefs + notifications); T26 marked `x` |
| Branch / PR | `phase-1/prefs`, PR opened 2026-11-05 on the user's go-ahead; built in `D:\Vxrcel\wanheda`. **Migration `0002_prefs_notifications` applied to Neon** (user go-ahead, 2026-11-05) |
| Main | `a4b0a48` — Merge pull request #7 (mini windows + dock); forged-commit check on `ef98faa..origin/main` clean (6 commits, incl. the user's `.gitignore` commit `c8a607d`) |
| Previous hand-off | docs/handoff/2026-11-04-phase-1-mini-windows.md |

## State in one paragraph

Settings → Appearance now picks a skin (Ember & Nebula, or Bench), any accent colour (seven presets or a free colour input), and a Home wallpaper (None, Glow, Orbs, Grid). The timer mode moved from the activity bus's localStorage into the same prefs. For the owner, prefs live in the new `user_prefs` table, so they follow them to another device. A cookie mirrors them, and a `<head>` boot script paints the skin and accent before React loads. Demo mode keeps prefs in the cookie only. The notification centre is a side sheet opened from the new rail bell or the palette ("Open notifications"). It lists past alerts (All / Unread, mark one by opening it, Mark all read) from the new `notification` table. The first real alert is "Timer done", raised by the browser when a timer reaches zero and recorded once per run, even with two tabs open (unique dedupe key).

## User decisions this session

- **Accent colour: option (c), a free colour** (user, 2026-11-04). It is still one signal hue at a time: the picked colour becomes `--signal`, and the text-safe variants are derived in CSS. Recorded in SPEC V15 and as an ADR-0009 amendment.
- **Process:** "you shoulda started phase-1/prefs in a new session with its continuation prompt, remember this for next checkpoint." Saved to memory (`new-session-per-checkpoint`). This checkpoint was finished in the same session as T26; the next one must start fresh.

## Decisions made without asking (check these)

- **Bench is mapped onto Wanheda's roles**, not the skill's `--sg-*` vocabulary, and it keeps the house fonts (V15). Its Space Mono display face is not loaded.
- **Contrast clamp, measured, not guessed.** Light mode: marks use `clamp(0.45, l, 0.6)` lightness and `min(c, 0.2)` chroma; text uses `min(l, 0.48)`. Dark mode: `max(l, 0.74)`. Over all 64 sRGB corner colours, the worst cases were: light marks 3.04:1 on Ember's band, light text 4.74:1, dark text 5.24:1. A lightness cap alone failed (2.77:1), because vivid greens and cyans clip out of gamut and brighten.
- **Prefs load failure:** the shell falls back to the device's cookie and still saves on change. The row is saved whole, and the change is the owner's latest word. Notifications that fail to load show a notice in the centre; new alerts still arrive.
- **Wallpapers are CSS gradients built from tokens** (no image uploads until R2). Glow and Orbs follow the accent.
- **Mobile has no bell.** The centre opens from the palette, and focus returns to the bell when it is on screen.

## Done

- Pure + tests: `lib/prefs/prefs.ts` (parse, cookie, boot script incl. tampered-cookie cases), `lib/notifications/notifications.ts`.
- Stores: `lib/prefs/store.ts`, `lib/notifications/store.ts`. Actions + tests: `actions/prefs.ts`, `actions/notifications.ts` (zod strict, owner from session, demo never saved, timer not ended → refused, non-uuid ids → refused).
- Schema: `lib/db/schema/{prefs,notifications}.ts`. SQL: `drizzle/0002_prefs_notifications.sql` (two new tables, RLS on, FK cascade, unique `(user_id, dedupe_key)`, index `(user_id, created_at desc)`), purely additive.
- UI: `components/prefs/{prefs-provider,wallpaper}.tsx`, `components/notifications/{notifications-provider,notification-centre}.tsx`, `components/settings/appearance-prefs.tsx`, `components/ui/segmented.tsx` (also used by the timer mode), the rail bell, the palette command, and a `backdrop` slot on `PageFrame`.
- CSS: Bench light and dark blocks, the accent derivation, wallpapers, and Bench reduced-transparency solids.
- Docs: SPEC T26 `x`, T27 `~`, V15 amended, §I for CP6; ADR-0009 amended; CHANGELOG two lines.

## Verification (actual results)

- typecheck clean; tripwire clean; Vitest 27 files / 349 passed. Design self-check greps clean. ESLint clean on all touched files.
- Browser (production build, demo mode, Chrome):
  - Bench light and dark with a cyan accent and Orbs at 1440 px. On a hard reload, the static fallback was already graphite: the boot script runs before React.
  - Ember light at 390 px, Settings with a custom lime accent.
  - Three timers finished: the bell went from 1 to 4 unread. Opened from the palette: opening an alert marks it read, the Unread filter works, and Mark all read leads to "All caught up". Escape closes the centre, and focus returns to the bell whether it was opened from the bell or the palette. Console empty.
- Migration applied with `bun --env-file=.env.local run db:migrate`. Checked read-only in Neon: `notification` 9 columns, `user_prefs` 7 columns, RLS on for both, primary keys, unique `(user_id, dedupe_key)`, index `(user_id, created_at DESC)`, FK `ON DELETE cascade` on both; `__drizzle_migrations` 3 rows; 0 rows in both tables.
- **Not verified:** the owner save/load round trip in the browser, prefs following to another device, the server dedupe live, and the `load-failed` paths. Those are unit-tested with mocks only. They are T28's "survives reload on another device" check.

## Known problems and risks

- Light-mode island: the island is always black, and in light mode the accent is clamped dark, so a very dark accent reads dim on the island pill. Text inside the island isn't covered by the measured guarantee.
- Demo sample alerts are re-stamped on every load. The demo is never saved, so this is cosmetic.

## Next steps

1. User merges the `phase-1/prefs` PR (migration already applied).
2. After merge, **in a new session** with the prompt below: mark T27 `x`, then T28 (Phase 1 exit).

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04):
build features; keep tripwire, forged-commit check and CI; one typecheck + test run before a
commit; no multi-round reviews or push/merge checks; commit, push and PRs only on the user's
word; a short hand-off + continuation prompt after every PR. No worktrees: branch off main in
D:\Vxrcel\wanheda itself. One checkpoint per session: after its PR merges, stop and hand over.

Phase 1 — The shell and the island. Last PR: T27 prefs + notification centre (branch
phase-1/prefs). Read docs/handoff/2026-11-04-phase-1-prefs.md and SPEC.md §T (T28).

Start: `git fetch`; check new commits on origin/main with
`sh scripts/forged-commits.sh a4b0a48..origin/main` before pulling. If the prefs PR is merged,
fast-forward main, mark T27 `x`, and `git switch -c phase-1/exit`; otherwise stack on
phase-1/prefs. Confirm migration 0002_prefs_notifications is applied (ask the user if unsure).
Then T28, the Phase 1 exit: board and prefs survive a reload on another device; Ctrl+K opens
every route and command; timer palette → island → expand → survives navigation; Lighthouse
a11y ≥ 95 on Home; Phase 1 done hand-off with Phase 2 prompts.
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only (review the PR diff with gh / git show, never switch the Builder's branch). Lean mode
(user, 2026-11-04): review only when the user asks, one pass per PR, FIX-level findings only, no
push or merge checks. Your LGTM is not the user's approval. Context:
docs/handoff/2026-11-04-phase-1-prefs.md, SPEC.md §V (V15 amended for the free accent).
```
