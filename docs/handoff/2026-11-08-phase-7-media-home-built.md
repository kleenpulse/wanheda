# Hand-off — Phase 7 follow-up: Media Home (T73) — built, awaiting Reviewer

| | |
|---|---|
| Date | 2026-11-08 |
| Phase / checkpoint | Phase 7 follow-up, T73 (PR 2 of 2) built |
| Branch | `feat/media-home` (off `main` @ `d5f465a`), **uncommitted** |
| HEAD | `d5f465a` — Merge pull request #65 |
| Previous hand-off | [2026-11-08-phase-7-media-player-built.md](2026-11-08-phase-7-media-player-built.md) |
| Plan | `C:\Users\skyep\.claude\plans\your-the-expert-ui-ux-snappy-iverson.md` (rev 3), PR 2 section |

## State in one paragraph
T73 is built per the plan's PR 2 section. `/media` has the tabs Home, Videos and Music, and a bare `/media` opens Home. Since a user request mid-build, the tabs sit in the page header's `actions` slot, as Money's do (`MediaTabs`). `?m=` opens the Watch view (the old VideosView, now `watch-view.tsx`) over any tab, and `mediaHref(id, tab)` keeps `?tab`, so Back returns to the tab. Home's shelves run in the plan's order, and there is a first-run card. Play history is pure `lib/media/stats.ts` on Dexie v5 `trackStats`. A "start" is counted in the music store (`playId`), not from the engine, because the engine fires `onTrack` on seeks too. The now-playing bar shows on Home and Music, and the island drops its `media` card while the bar is up (`holdMusic` counter, `rankActivities(xs, hidden)`). The Videos tab is a card grid with search, showing 48 cards to a page. Music has `?sort=plays`. SPEC: T73 marked x, V61 amended, V66 added. The CHANGELOG has four entries.

## Found and fixed during the browser run
- **The bar's volume rocker ate page scroll.** Its wheel-to-volume handler `preventDefault`s, and the bar is fixed over a scrolling page, so a real scroll over it turned the music to 0. Fix: `VolumeRocker wheel={false}` on the bar (the island card keeps the wheel).
- **User, mid-build:** the Theatre button was hidden below `@3xl/cinema` (768 px). A short window narrows the stage (`FILL_STAGE`), so it vanished exactly when it's most useful. Theatre now shows from `@md`, and Fit/Fill steps aside instead (`@3xl`). Browser: at 460 px Theatre shows and Fit doesn't, at 800 px both show, and nothing overflows (16 px margin kept).

- **User, after the first review:** the centre play and ±10 buttons wear the resume prompt's `glass-window` with theme ink (`CENTRE_GLASS` in video-chrome.tsx). Browser: Nebula frosted teal, Ember frosted white with dark ink.

## Reviewer round 1 (wanheda-bc): LGTM with nits
- Taken: 1 Shelf tabindex now set after every render. 2 `record` counts inside a Dexie rw transaction (get → +1 → put) and the map takes the stored row. 3 the worker reports `unreadable` (files listed but not opened) on `done`, and `pruneList` keeps their history. 5 Shows opens the episode after the furthest watched, else the first not watched.
- Not taken: 4 (a prev-restart isn't a new start): by design, a restart is the same listen.
- Gates after: typecheck clean; 144 files / 1487 tests; tripwire clean; lint clean on the touched files.

## Files (stage explicitly; never `git add -A`)
- New: `components/media/{media-home,shelf,media-cards,videos-grid,now-playing-bar,watch-view,add-bar,watch-nav,track-stats}.tsx|ts`; `lib/media/stats.ts` + `stats.test.ts`.
- Changed: `app/(shell)/media/page.tsx`; `components/media/{media-app,music-library,music-player,music-view,now-playing-card,video-chrome}.tsx|ts`; `components/island/island.tsx`; `components/shell/command-palette.tsx` (in-page opens keep the tab); `lib/activity/{priority,priority.test,store}.ts`; `lib/media/{episodes,episodes.test,local,media,media.test,music.worker,music-protocol}.ts`; `components/media/music-library.test.ts`; `SPEC.md`; `CHANGELOG.md`; `docs/handoff/LATEST.md` + this file.
- Not ours (untracked, from earlier sessions): `docs/handoff/2026-11-07-music-polish.md`, `2026-11-07-phase-7-exit-machine.md`, `2026-11-08-aurora-edge.md`, `2026-11-08-page-wallpapers.md`, `2026-11-08-video-folder.md`. Ask the user before staging them.

## Verification (actual results)
- `bun run typecheck`: clean. `bun run test`: 144 files, 1484 tests pass. `bun run tripwire`: clean. `bun run build` (demo env): clean. The first cold build printed "Found 3 warnings while optimizing generated CSS"; cached rebuilds print none. These are not yet traced, so it's unknown whether they predate this branch. Lint: only `no-img-element` warnings (blob URLs, the same as the covers).
- Browser (demo standalone on :3305, a scratchpad copy; the owner's `next dev` holds :3000):
  - Bare `/media` opens Home.
  - A 440, scrubbed to its end, is **not** counted. Chirps 1–3, with half or more heard, are counted. Most played and Recently played (Gapless Run album card) fill in.
  - The bar shows on Home and Music, and the island lists 3 activities on `/media` against 4 on `/notes` (music back).
  - A Videos card opens `?tab=videos&m=…`, and Back returns to the grid.
  - 390×844 Ember: the bar sits clear of the tab bar (art, title, play, next, queue), the shelf has an edge fade, and the mini progress line shows.
  - The header tabs drive the app, with one tab group on the page.
- Not checked: a real kept folder (Dexie persistence and pruning, owner only), the Queue popover jump, the reduced-motion emulation pass, a Lighthouse a11y run and a performance trace. Ask the Reviewer to weigh them.

## Next
1. The Reviewer (`wanheda-bc`) reviews the uncommitted diff. On LGTM: commit (explicit paths), push and open the PR. The merge is the user's call. No SQL migration (Dexie v5 is client-side).
2. Owner checks after the merge: with a real music folder, a play persists across a reload; a rescan after deleting a file prunes its history; and an unplugged drive keeps it.

## Continuation prompt
> Read `docs/handoff/LATEST.md`, then `docs/handoff/2026-11-08-phase-7-media-home-built.md`. Verify against the repo (git, tripwire, typecheck, tests). If PR "Media Home" (T73) is open, carry the Reviewer (`wanheda-bc`) loop to LGTM; if merged, run `git tidy`, ask the Reviewer for the main check, then return to the T65 owner checks in `2026-11-07-phase-7-exit-machine.md`.
