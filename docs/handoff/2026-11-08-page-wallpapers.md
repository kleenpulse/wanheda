# Hand-off: page wallpapers (T69) — 2026-11-08

## State

- Branch `feat/page-wallpapers`, pushed. PR #60, tip `c1ac43f`, base `main` at `b21e5c5`.
  - `974c639` fix(ui): light Bench `--card` = floor grey `#f9f9fb` (was the sheet's white).
  - `c1ac43f` feat(prefs): wallpapers on any page (T69, SPEC V64).
- Reviewer (`wanheda-bc`): LGTM after one FIX (route skeleton) and two nits. Post-push tip check requested.
- **#60 merged** (`fa53701`, GitHub merge, forged-commits clean). **Migration 0011 applied** on the user's word (2026-11-08). It ran from a frozen `git archive fa53701` copy of `drizzle/` with `bun --env-file=.env.local run db:migrate -- --config <scratch>`, because another session was switching branches in the shared checkout. Read-only check: `user_prefs` has `wallpaper_scope` (text, default 'home'), `wallpaper_cover` (text, default 'sheet'), `wallpaper_pages` (jsonb, nullable); `__drizzle_migrations` = 12 rows.
- T65 owner checks (Phase 7 exit) are still pending, unchanged; see [2026-11-07-music-polish.md](2026-11-07-music-polish.md).

## What T69 does

- Settings → Appearance → Wallpaper: Show on (Home | All pages | Choose per page), per-page scene pickers, Covers (Below the top bar | Whole page).
- Whole page: `WallpaperMain` (`components/prefs/wallpaper.tsx`) renders the shell's `<main>` + one scene keyed by name; `data-wallpaper-cover="page"` set in render. Below the top bar: `SheetWallpaper` per `PageFrame`.
- `PAGE_ROOT` / `PAGE_SHEET` in `components/shell/page-frame.tsx` are shared with `app/(shell)/loading.tsx`. Sheet tint only, never `backdrop-filter`.
- Pure core in `lib/prefs/prefs.ts` (`wallpaperFor`, `seedPages`, `withPageWallpaper`), route → page in `lib/prefs/wallpaper-pages.ts`, save schema in `lib/prefs/schema.ts`.

## Verified

typecheck, build, 1398 tests, tripwire, forged-commits (`main..HEAD`) clean. Browser checks ran against a demo-mode production build on :3043, because the user's own dev server on :3000 needs sign-in. Not browser-proven: the real skeleton path (prefetch always won) and the palette commands.

## Next

1. Done: merge + migrate. Still to do: `git tidy`, and ask the Reviewer for the main check on `fa53701`.
2. Owner round trip: set per-page wallpapers on one device and check them on another.
3. Then T65's owner checks, as before.
