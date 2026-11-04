# Hand-off — Phase 1: The shell and the island — home board (PR #6)

| | |
|---|---|
| Date | 2026-11-04 |
| Phase / tasks | Phase 1, SPEC T25 (home board) |
| Branch / PR | `phase-1/board`, PR #6 (open), code commit `07ee923`; built in the main checkout `D:\Vxrcel\wanheda` (no worktrees any more) |
| Main | `e3cf66d` — Merge pull request #5 (palette + island) |
| Previous hand-off | docs/handoff/2026-11-04-phase-1-palette-island.md |

## State in one paragraph

Home is now a widget board (react-grid-layout 2.3.0): clock, weather, today and quick note, offered by the Home manifest's new `widgets`. "Edit board" turns on drag, corner resize, add (picker) and remove; each widget's grip moves it with arrows and resizes it with Shift+arrows. The owner's layout is saved per breakpoint (lg/md/sm by board width) to the new `board_layout` table via `actions/board.ts`; demo mode shows the seed and never saves; a failed read shows the seed with a notice and never saves. The migration `0001_board_layout` is applied to Neon.

## Process (user, 2026-11-04)

- Lean mode as before: tripwire, forged-commit check and CI; one typecheck + test run before a commit; commit, push and PRs on the user's word; a short hand-off + prompt after every PR.
- **New: no worktrees.** Branch off `main` inside `D:\Vxrcel\wanheda`. `D:\Vxrcel\wanheda-wt` was removed (both `board` and `shell`). The main checkout has `.env.local`, so `bun run dev` there is gated mode against the real Neon DB: an unapplied migration breaks Home.
- `db:migrate` needs the env passed explicitly: `bun --env-file=.env.local run db:migrate` (plain `bun run db:migrate` reaches drizzle-kit without the URL).

## Done

- Board: `components/board/board.tsx`; pure rules `lib/board/layout.ts` (+ tests); persistence `lib/board/store.ts`; action `actions/board.ts` (+ tests with mocked owner/store).
- Widgets: `components/widgets/` (server-built slots keyed by `WidgetId`, so a missing renderer fails typecheck); weather in `lib/weather/` (Open-Meteo, keyless, `use cache` 15 min; demo → sample; fetch failure → error state); `hooks/use-now.ts`.
- Schema: `lib/db/schema/board.ts`, shared `columns.ts`; `auth.test.ts` now scoped to the auth tables.
- Env: `WEATHER_LATITUDE`, `WEATHER_LONGITUDE`, `WEATHER_PLACE` (optional, all three or sample). Not set anywhere yet.
- SPEC: T23/T24 `x`, T25 `~` (mark `x` after merge), §I entries for P1 CP4. CHANGELOG: one line.

## Verification (actual results)

- typecheck clean; tripwire clean; Vitest 19 files / 292 passed. One earlier full run exited 1 and two reruns passed; the failing test was not captured (possible flake, watch for it). Playwright smoke 13 passed locally.
- Migration checked in Neon: 6 columns, RLS on, pkey + unique `(user_id, breakpoint)`, FK cascade, `__drizzle_migrations` 2 rows, 0 board rows.
- Browser (built app, demo, Chrome): Nebula + Ember at 1440 px, Ember at 390 px; keyboard move and resize with announcements; remove + re-add via the picker; a pointer drag; console empty.
- Not verified: owner save round-trip against Neon (unit-tested only), live weather, the load-failed notice, reload on another device (T28 exit).

## Known problems and risks

- gitleaks not on `PATH` locally; CI scans.
- Vertical compaction can leave a gap at the top left when a wide widget can't float past a narrow one. Library behaviour, not a bug.
- The CLAUDE.md "Builder in its own worktree" line is stale; the user has not asked for it to be edited.
- Open for T27: FRD "accent colour" vs V15 one signal hue (ask the user).

## Next steps

1. User merges PR #6 → mark T25 `x`. Owner check: edit the board signed in, reload on another device.
2. T26 mini windows + dock (FR-SHELL-4/5): timer mini window, positions remembered, dock from manifests.
3. Then T27 prefs + notifications (ask about accent colour first), T28 exit.

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04):
build features; keep tripwire, forged-commit check and CI; one typecheck + test run before a
commit; no multi-round reviews or push/merge checks; commit, push and PRs only on the user's
word; a short hand-off + continuation prompt after every PR. No worktrees: branch off main in
D:\Vxrcel\wanheda itself.

Phase 1 — The shell and the island. Last PR: #6 (home board, branch phase-1/board). Read
docs/handoff/2026-11-04-phase-1-board.md and SPEC.md §T (T26–T28).

Start: `git fetch`; check new commits on origin/main with
`sh scripts/forged-commits.sh e3cf66d..origin/main` before pulling. If PR #6 is merged,
fast-forward main and `git switch -c phase-1/mini-windows`; otherwise stack on phase-1/board.
Then build T26 (mini windows + dock). Migrations: generate and show the SQL; apply only on the
user's go-ahead, with `bun --env-file=.env.local run db:migrate`.
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only (review the PR diff with gh / git show, never switch the Builder's branch). Lean mode
(user, 2026-11-04): review only when the user asks, one pass per PR, FIX-level findings only, no
push or merge checks. Your LGTM is not the user's approval. Context:
docs/handoff/2026-11-04-phase-1-board.md, SPEC.md §V.
```
