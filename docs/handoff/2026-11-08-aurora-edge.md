# Hand-off: Aurora from top or bottom (T71) — 2026-11-08

## State

- Branch `feat/aurora-edge`, 1 commit `a150116` on `main` `da3c9e3`. PR #62 is open.
- Reviewer (`wanheda-bc`): LGTM with two optional nits. Nit 1 is accepted and recorded in V64. Nit 2 was checked in the browser. The post-push tip check has been requested.
- **Pending, user only:** merge #62, then `bun run db:migrate` for `drizzle/0012_aurora_edge.sql` (1 ADD COLUMN `aurora_edge`, default 'top'). Until it runs, owner prefs saves fail and loads fall back to the cookie. Last time the migration was run from a frozen `git archive` copy of merged `main`, because another session was switching branches in the shared checkout. The command was `bun --env-file=.env.local run db:migrate -- --config <scratch>/drizzle.config.ts`, with an absolute `out`.

## What T71 does

- `prefs.auroraEdge` `top|bottom`. A mini tab (`Segmented size="sm"`) appears under the Wallpaper picker when Aurora is chosen. In per-page mode it gets its own row.
- `components/prefs/wallpapers/aurora.tsx`: the `uFromBottom` uniform and the pointer are both measured from the light's edge (Motion Garden's `horizon-aurora` `position`).
- `components/prefs/wallpaper.tsx`: bottom Aurora is `fixed` to the viewport's bottom, right of the rail, faded upward (`.wallpaper-fade-up`).

## Next

1. The user merges #62 and gives the go-ahead to migrate 0012. Then `git tidy`, and ask the Reviewer for the main check.
2. T65 owner checks, as listed in LATEST.
