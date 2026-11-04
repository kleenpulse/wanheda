# Hand-off — Phase 1: The shell and the island — palette + island (PR #5)

| | |
|---|---|
| Date | 2026-11-04 |
| Phase / tasks | Phase 1, SPEC T23 (palette) + T24 (island) |
| Branch / PR | `phase-1/palette`, PR #5 (open), code commit `1d930f7`; worktree `D:\Vxrcel\wanheda-wt\shell` (folder name kept from CP1) |
| Main | `983eb8a` — Merge pull request #4 (shell port) |
| Previous hand-off | docs/handoff/2026-11-04-phase-1-cp1-shell.md |

## State in one paragraph

The shell now has a command palette and the dynamic island. Ctrl/⌘K, `/`, the floating pill or the phone tab bar's search button opens the palette: apps, timer presets, pause/resume/cancel for running timers, and typing a length (`25`, `90s`, `1h30`) starts that timer. Theme and the sidebar toggle are pinned in its footer. Timers live on a new activity bus (`lib/activity/store.ts`, zustand, persisted to `localStorage`) and show in a black island at the top of the content column that expands into a card. Timers survive navigation, reloads and other tabs.

## Process (user, 2026-11-04)

Lean mode while the app is near-empty: tripwire, forged-commit check and CI stay; one typecheck + test run before a commit; no multi-round reviews and no push/merge checks; a Reviewer pass only if the user asks. Commit, push and PRs still only on the user's word. A short hand-off + continuation prompt after **every** PR.

## Done since the previous hand-off

- PR #4 (shell port) merged by the user → `983eb8a`; incoming merge checked with `forged-commits.sh 0490755..origin/main` (clean) before fast-forwarding local `main`.
- Palette: `components/shell/command-palette.tsx` (cmdk `Command.Dialog`, centred on the viewport because it portals outside `--rail-w`), `palette-store.ts`, `floating-pill.tsx`, tab-bar search button.
- Island: `components/island/live-activity.tsx` (Shadow Garden `LiveActivity` morph/keyboard/cycle; own 10 Hz rAF tick instead of `use-animation-loop`; `show` prop brings a new timer forward; live `status` for screen readers), `timer-activity.tsx`, `island.tsx` (rehydrates after mount, `storage` event for other tabs).
- Bus: `lib/activity/timer.ts` (pure, clock-free) + tests; `lib/activity/store.ts`.
- `--color-island` / `--color-island-foreground` in `app/globals.css` (black/white in both skins, sanctioned always-dark surface).
- `app/(shell)/loading.tsx`: fixes Next's "uncached data during prerendering" error on client navigations (pages call `requireOwner()` → `connection()` with no Suspense boundary of their own).
- Deps: `cmdk` 1.1.1 (2025-03-14), `zustand` 5.0.16 (2026-10-22), pinned.
- SPEC: T22 `x`, T23/T24 `~` (mark `x` after merge). CHANGELOG: two lines.

## Verification (actual results)

- typecheck clean; lint silent; Vitest 16 files / 265 passed. e2e not run locally.
- PR #5 CI: `rails` pass, `check` pass (includes the Playwright smoke), GitGuardian pass.
- Browser (built app, demo, Chrome): Ctrl+K → `25` → one "Start a 25 min timer" item → Enter; second timer via `90s`; client navigation to `/settings` through the rail: island background `rgb(0, 0, 0)`, newest timer in front, console empty. That run labelled the 90 s timer "2 min timer"; `formatDuration` was fixed afterwards ("1 min 30 sec", unit-tested, not re-checked in the browser). Card: pause, +5, cancel; focus moves into the card. Palette footer checked in Ember at 1440 px.
- Not verified: footer in Nebula and at phone width; owner (signed-in) mode; reduced motion; a timer finishing while the tab is hidden.

## Known problems and risks

- A `next dev` on `:3000` (PID 33476, from this worktree, not started by the Builder) served stale CSS (no island styles). Restart it to see current styles.
- gitleaks is not on `PATH` locally; the hook skips it, CI scans.
- No sound or system notification when a timer ends; it shows "Done" in the island until dismissed.
- Open for T27: FRD "accent colour" vs V15 one signal hue (ask the user).

## Next steps

1. User merges PR #5 → mark T23/T24 `x`.
2. T25 home board: `react-grid-layout`, `board_layout` table + reviewed SQL from `bun run db:generate` (`db:migrate` only on the user's go-ahead), layout per breakpoint via a server action with `requireOwner()`, demo = seed layout not saved, widgets (clock/date, weather, quick note + today placeholders), widget picker.
3. Then T26 mini windows + dock, T27 prefs + notifications, T28 exit.

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04):
build features; keep tripwire, forged-commit check and CI; one typecheck + test run before a
commit; no multi-round reviews or push/merge checks; commit, push and PRs only on the user's
word; a short hand-off + continuation prompt after every PR.

Phase 1 — The shell and the island. Last PR: #5 (palette + island, branch phase-1/palette,
worktree D:\Vxrcel\wanheda-wt\shell). Read docs/handoff/2026-11-04-phase-1-palette-island.md
and SPEC.md §T (T25–T28).

Start: `git fetch`; check any new commits on origin/main with
`sh scripts/forged-commits.sh 983eb8a..origin/main` before pulling. If PR #5 is merged, branch
phase-1/board from origin/main (new worktree D:\Vxrcel\wanheda-wt\board, `bun install`);
otherwise stack on phase-1/palette. Then build T25 (home board). Migrations: generate and show
the SQL; apply only on the user's go-ahead.
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only in the Builder's worktree. Lean mode (user, 2026-11-04): review only when the user
asks, one pass per PR, FIX-level findings only, no push or merge checks. Your LGTM is not the
user's approval. Context: docs/handoff/2026-11-04-phase-1-palette-island.md, SPEC.md §V.
```
