# Hand-off — Phase 1: The shell and the island — mini windows + dock (T26)

| | |
|---|---|
| Date | 2026-11-04 |
| Phase / tasks | Phase 1, SPEC T26 (mini windows + dock) |
| Branch / PR | `phase-1/mini-windows`, PR #7 (open), code commit `fc3ed4b`, favicon `50f07f3` (user asked for it in the PR); built in `D:\Vxrcel\wanheda` |
| Main | `ef98faa` — Merge pull request #6 (home board); forged-commit check on `e3cf66d..origin/main` clean (3 commits) |
| Previous hand-off | docs/handoff/2026-11-04-phase-1-board.md |

## State in one paragraph

The shell has a mini-window layer and a dock. The timer is the first window: it lists every timer on the bus (pause, +5 min, cancel) and has 5/15/25/50 quick starts. Windows drag by the title bar and resize from the corner. The grip is the keyboard path: arrows move, Shift+arrows resize, Escape closes. A drop within 24 px of an edge snaps to it, and the window stores the edge, not the offset, so it stays on that edge when the layer changes size. Positions and the open set are kept per device in localStorage (`wanheda-windows`), so there is no table and no migration. The dock (md and up) replaces the floating pill: pinned apps, a divider, tools (Timer), then the search pill. A dot marks what is running (a live activity or an open window). The palette gains a Windows group (open or close each window).

## User decisions this session

- **Repeat timers (user, 2026-11-04):** the user asked whether two 25 min timers were intended, then chose "make it a choice in settings, but by default One per length". `single` (default): starting a length already on the bus brings that timer forward in the island (a finished one restarts in place). `multiple`: starts another, numbered "25 min timer 2". The setting is in Settings → Timers, stored with the timers in `wanheda-activity` (device-local) until T27 prefs.
- **Bottom padding (user):** the timer window body lost its bottom padding once it scrolled. Fixed (`min-h-full`, `pb-5`).

## Decisions made without asking (check these)

- **Positions per device, not in the DB.** A place on a big monitor means nothing on a laptop. Prefs (T27) can add sync later if wanted.
- **Timer is a "tool", not an app.** `TOOLS` in `lib/modules.ts`: `ToolManifest` = manifest without route and widgets. Its window id is `timer.window`. Timer is `pinned`, so the dock is not just Home.
- **The dock replaced the floating pill.** The search pill now sits at the dock's end (label "Search", tooltip "Search or start a timer"). Phones keep the tab bar, with no dock there; windows still open from the palette.
- **New `glass-window` utility** (glass tokens, 48 px blur). The house 20 px `glass` let page text show through clearly in Ember.

## Done

- Registry: `lib/modules.ts`: `WindowDef`, `ActivityKind`, `windows`, `activities`, `pinned`, `TOOLS`, `WindowId`, `WINDOWS`, `isWindowId`, `windowDef`.
- Pure logic + tests: `lib/windows/geometry.ts` (clamp, settle/snap, default and cascade, keyboard nudge, parse), `lib/windows/state.ts` (stack order, sanitize stored state), `lib/shell/dock.ts` (pinned ∪ running).
- Store: `lib/windows/store.ts` (zustand persist, `skipHydration`, sanitizing `merge`).
- UI: `components/windows/{window-layer,mini-window,timer-window}.tsx`, `components/shell/dock.tsx` (magnetic-dock port), `components/ui/progress-ring.tsx` (moved out of the island). `floating-pill.tsx` deleted. Palette Windows group. `lib/motion.ts` gains `SNAP_SPRING` and `DOCK_SPRING`.
- Timer mode: `lib/activity/timer.ts` (`setMs`, `lengthOf`, `sameLength`, `restart`, `labelFor`), the store (`timerMode`, `setTimerMode`, `lastStartedAt`), the island `showKey`, `components/settings/timer-mode.tsx`, and tests in `lib/activity/{timer,store}.test.ts`.
- Flaky test fixed (side fix): `lib/auth/server.test.ts` "returns null when auth is not configured" timed out at 5 s. The first test pays the cold import of Better Auth + Drizzle, and that took over 5 s under the parallel suite. It failed twice in three captured runs; the describe now has a 30 s timeout. This was the uncaptured failure from the board hand-off.
- SPEC: T25 `x`, T26 `~`, and §I entries for P1 CP5. CHANGELOG: three lines.

## Verification (actual results)

- typecheck clean; tripwire clean; Vitest 23 files / 323 passed, twice in a row after the flake fix. The design self-check greps (hex/rgb, white/black) are clean on the new files. ESLint on the touched files is clean. Repo-wide lint still reports older errors in `lib/board/layout.ts` and the widgets (lint does not gate).
- Browser (built app, demo, Chrome, 1440 px):
  - The dock opens the window snapped bottom-right at the 12 px margins, and focus moves into it. Starting a timer there updates the island, Today and the dock's running dot together.
  - A pointer drag stores a free placement. A drag past the left edge snaps to start.
  - Keyboard: → steps 16 px off the snapped edge (not pulled back). Shift+→ resizes, and the change is announced.
  - The corner resize works. The window keeps its place and size across a reload, without stealing focus.
  - Escape closes the window and focus lands on the dock entry. Palette "timers window" + Enter opens it, and focus lands in the window.
  - The window survives navigation to /settings.
  - Shown in Ember + Nebula at 1440 px and 390 px. Console empty.
  - Timer mode: two clicks on 25 min give one timer by default. After choosing "Allow repeats" in Settings, the timers are labelled "25 min timer", "… 2", "… 3". With three timers in a 320 px window, scrolled to the end, there are 20 px below the presets.
- Not verified: reduced motion (MotionConfig + `useReducedMotion` paths, not exercised in the browser), touch drag on a real phone, and two windows at once (only one window exists).

## Known problems and risks

- A user's `bun run dev` was running on :3000 (PID 29700) during this session, so verification used `bun run build` + `start` on :3200 with zero env. It was left running.
- Two tabs write the same `wanheda-windows` key, and the last writer wins. Open windows are not synced live across tabs (timers still are).
- Dock tooltips only follow the pointer or focus (magnetic-dock behaviour). No delay or touch fallback, because the dock is desktop only.
- Open for T27: FRD "accent colour" vs V15 one signal hue (ask the user). The stale CLAUDE.md worktree line from earlier is still there.

## Next steps

1. User merges PR #7 (no migration in this checkpoint). `.impeccable/config.json` (two file-scoped design-hook ignores for the resize-corner glyph) stays untracked: the user said to leave it out.
2. After merge: mark T26 `x`.
3. T27 prefs + notifications: ask about the accent colour first. Pinned dock items can become a pref there.
4. T28 Phase 1 exit.

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04):
build features; keep tripwire, forged-commit check and CI; one typecheck + test run before a
commit; no multi-round reviews or push/merge checks; commit, push and PRs only on the user's
word; a short hand-off + continuation prompt after every PR. No worktrees: branch off main in
D:\Vxrcel\wanheda itself.

Phase 1 — The shell and the island. Last PR: T26 mini windows + dock (branch
phase-1/mini-windows). Read docs/handoff/2026-11-04-phase-1-mini-windows.md and SPEC.md §T
(T27–T28).

Start: `git fetch`; check new commits on origin/main with
`sh scripts/forged-commits.sh ef98faa..origin/main` before pulling. If the mini-windows PR is
merged, fast-forward main, mark T26 `x`, and `git switch -c phase-1/prefs`; otherwise stack on
phase-1/mini-windows. Before building T27, ask the user about FRD "accent colour" vs V15 one
signal hue. Migrations (user_prefs, notification): generate and show the SQL; apply only on the
user's go-ahead, with `bun --env-file=.env.local run db:migrate`.
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only (review the PR diff with gh / git show, never switch the Builder's branch). Lean mode
(user, 2026-11-04): review only when the user asks, one pass per PR, FIX-level findings only, no
push or merge checks. Your LGTM is not the user's approval. Context:
docs/handoff/2026-11-04-phase-1-mini-windows.md, SPEC.md §V.
```
