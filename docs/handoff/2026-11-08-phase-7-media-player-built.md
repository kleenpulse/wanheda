# Hand-off — Phase 7 follow-up: Cinema player (T72) — built, awaiting Reviewer

| | |
|---|---|
| Date | 2026-11-08 |
| Phase / checkpoint | Phase 7 follow-up, T72 (PR 1 of 2) built; T73 Media Home = PR 2, next session |
| Branch | `feat/media-player` (off `main` @ `06f327b`), **uncommitted** |
| HEAD | `06f327b` — Merge pull request #64 |
| Previous hand-offs | [step a](2026-11-08-phase-7-media-player-chrome.md), [step b](2026-11-08-phase-7-media-player-up-next.md) |
| Plan | `C:\Users\skyep\.claude\plans\your-the-expert-ui-ux-snappy-iverson.md` (rev 3) |

## State in one paragraph
All four steps of T72 are built. (a) The player's own chrome replaces Video.js's skin, with keys, app-drawn captions and full screen on the stage wrapper. (b) Series come from file names, with up next, autoplay, `meta.folder` and the PiP carry. (c) Thumbnails are kept on the device, in OPFS `media-thumbs`. Single-file adds grab their frame on the identify engine. Folder adds and older items go through `thumb-queue`, which pauses while a video plays. The YouTube still is fetched once, and `i.ytimg.com` answered `ACAO: *`, so no fallback is needed. `cover.tsx` now uses the shared miss-proof cache. (d) The library list shows thumbnail rows that lead with the episode title. A mid-build request from the user is also in: the resume prompt is now `glass-window` (frosted). SPEC T72 (x) and T73 (.) rows are added, V51/V57/V60 are amended and V65 is new. ADR-0013 has an amendment, and the CHANGELOG has entries.

## Files (stage explicitly; never `git add -A`)
- New: `components/media/{video-chrome,video-scrub,video-menus,captions-layer,up-next-rail,thumb,thumb-queue}.tsx|ts`; `lib/media/{player-keys,cinema,video-store,episodes,opfs-image}.ts` + their `.test.ts`.
- Changed: `components/media/{media-app,media-surface,stage,player-store,use-player,use-playback-tracking,use-media,cover}.tsx|ts`; `components/ui/{menu,tooltip,select}.tsx`; `lib/media/{engine-protocol,engine.worker,media,media.test,store,types}.ts`; `lib/platform/media.ts`; `SPEC.md`; `CHANGELOG.md`; `docs/adr/0013-media-engines.md`; `docs/handoff/LATEST.md` + this file and the step a/b hand-offs.
- Not ours (left by earlier sessions, untracked): `docs/handoff/2026-11-07-music-polish.md`, `2026-11-07-phase-7-exit-machine.md`, `2026-11-08-aurora-edge.md`, `2026-11-08-page-wallpapers.md`, `2026-11-08-video-folder.md`. Ask the user before staging them.

## Verification (actual results)
- `bun run typecheck`: clean. `bun run test`: 142 files, 1451 tests pass. `bun run tripwire`: clean. `bun run build` (demo env): clean. Lint is clean on every touched file except `no-img-element` warnings, the same as the existing covers. The React Compiler findings were fixed: `useEffectEvent`, element writes through `seekElement`/`setElementRate`, `FramePreview` class, derived visibility.
- Browser (demo standalone :3305, a copy of `.next/standalone` in the scratchpad, because the owner's `next dev` holds :3000):
  - Nebula 1440×900: controls, keys `k`/`f`, full screen with menus, status line, captions and rail; Season 1|2 menu; autoplay E01→E02 with E01 Watched.
  - Ember 1440×900: thumbnail rows.
  - 390×844: control row fits (fit and theatre hidden on a narrow player); frosted resume prompt.
  - OPFS: 6 thumbs (5 local incl. MKV as WebP, YouTube as JPEG).
- Not checked: PiP carry (needs a real PiP window), the permission-gesture card (needs a lapsed FSA handle), a performance trace, reduced motion emulation, Lighthouse. Ask the Reviewer to weigh them.

## Next
1. The Reviewer (`wanheda-bc`) reviews the uncommitted diff. On LGTM, commit (explicit paths), push and open the PR (memory: Reviewer LGTM = commit + push + PR without asking). The merge is the user's call; there's no migration.
2. After the merge, a new session runs T73 (`feat/media-home`) from the plan's PR 2 section.

## Continuation prompt
> Read `docs/handoff/LATEST.md`, then `docs/handoff/2026-11-08-phase-7-media-player-built.md`. Verify against the repo (git, tripwire, typecheck, tests). If PR "Cinema player" (T72) is merged, branch `feat/media-home` off `main` and build T73 per the plan file's PR 2 section and SPEC T73 (add V66). Demo browser checks: build + standalone copy on :3305 (memory: demo-dev-server-empty-env). Reviewer: `wanheda-bc`.

## Reviewer FIX round 1 (wanheda-bc) — delta, uncommitted

- **FIX 1 keys after a click:** `KeyTarget` split into `button` (keeps Space|Enter only) and `widget` (slider, rail, menu trigger `[aria-haspopup]`: keeps arrows too). Browser: focus on a chrome button, ArrowLeft took 7.13 s → 2.13 s.
- **FIX 2 rail size:** pure `railItems(items, current, 20)` (series: all episodes; else current + next 19). Browser, 32-item library, paused full screen: 20 cards, 0 long tasks (PerformanceObserver `longtask`; a DevTools trace stops full screen from engaging, so the in-page observer was used).
- **FIX 3 PiP froze on the removed `<video>` (user's browser test):** the carry starts in the wiring's layout cleanup (before node removal) on every path; the next chrome claims it and calls `requestPictureInPicture()`; unclaimed in 3 s, refused, or no metadata in 10 s ⇒ `exitPictureInPicture()` + notice. Root cause found on the way: on an item change the new chrome mounted with the *old* element still registered, so it claimed the carry on the dying element. Now the store records `itemId` per element and the frame shows chrome only for its own item. Browser: PiP open → (a) row click, (b) Shift+P, (c) autoplay with no gesture → PiP on the new, connected, playing video each time; (d) YouTube row → window closed + notice. Store test: claim keeps, unclaimed closes, `itemId` per register.
- **Nits taken:** 3 (Thumb asks once per key via `useEffectEvent`; per-tab `notLocated`, cleared by `retryThumb` on reopen|regrant), 4 (`thumb()` 15 s timeout), 5 (folded into FIX 3; an embed ends the carry at once), 6 (YouTube marker only after an HTTP answer or a refusal while online; cleared by `dropThumb`), 7 (`t` theatre from the frame for embeds), 8 (`grabbingThumb` marks the fp pending before the save), 9 (`useFullscreen` subscribe hoisted).
- Gates: typecheck clean; 143 files / 1458 tests; tripwire clean; lint clean (no-img-element only). CHANGELOG PiP line and SPEC V65 corrected to what happens.

## Reviewer re-review (wanheda-bc): LGTM with nits

- Nit 1 taken: closing the player (× or an app hop) while in PiP ended the carry only after 3 s, with the "next video didn't open" notice. `CinemaFrame` (unkeyed: it stays across item changes, unmounts only on close) now ends any carry in a passive unmount cleanup, which runs after the wiring's layout cleanup started it. Browser: PiP open on Sintel, then Home in the rail: window closed 112 ms after the click, toast "Picture in picture closed" with no reason line. A row change in PiP still carries (Big Buck Bunny, connected, playing, no notice). SPEC V65 updated.
- Nit 2 (out of scope, for the user): PiP can't outlive /media, since apps unmount on a hop. True before T72 too; a persistent video host is a product question.
- Gates after the nit: typecheck clean; 143 files / 1458 tests; tripwire clean; lint clean on the file.
