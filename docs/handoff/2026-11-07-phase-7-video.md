# Hand-off — Phase 7: Media — video (T62)

| | |
|---|---|
| Date | 2026-11-07 |
| Phase / checkpoint | Phase 7 CP3, T62 `phase-7/video` |
| Branch | `phase-7/video` (off `main` at `5014b01`) |
| HEAD | `5014b01` — Merge pull request #47 (the work is uncommitted on top) |
| Previous hand-off | docs/handoff/2026-11-07-phase-7-media-core.md |

## State in one paragraph

T61 is merged as PR #47 (`5014b01`). The Reviewer's post-merge check: VERIFIED.

T62 is built and checked in the browser:
- resume and watched, saved on the device first and on the server later;
- the Continue and Watch later lists;
- theatre mode;
- SRT and VTT sidecar subtitles;
- palette player commands;
- one Media Session arbiter, shared by speech and video.

The owner was asleep and told the Builder to commit, push, open the PR and merge on the Reviewer's LGTM, then take the next task.

## Done this session

- **Schema:** `drizzle/0010_media_watch_later.sql` adds `media_item.watch_later_at`. It is not applied, and it runs after 0009. This is a new migration, not an edit of the merged 0009.
- **Progress (V55):**
  - `lib/media/playback.ts` (pure, tested): `layProgress`, `continueList`, `watchLaterList`, `writesDue`.
  - `components/media/playback-store.ts`: the device copy, in Dexie `wanheda-media` v2 (`progress`, with a pending flag). Pending writes are re-sent on load.
  - `POST /api/media/progress`, mirroring the reader's beacon route: same-origin only, ≤ 1 KiB, `requireOwner` first, demo never saves.
  - `savePlayback`: newer `at` wins, and only on the owner's own row.
  - `use-playback-tracking.ts` writes locally every 5 s and to the server every 15 s. Pause, end and hide write both, and page close sends a beacon. Resume goes through `resumeAt` on `loadedmetadata`.
- **Watch later:** `setWatchLater` store function plus the `watchLater` action. It is optimistic: a failure puts the old state back and says so.
- **UI** (`media-app.tsx`):
  - The list has Continue, Watch later and All sections.
  - Each row shows a progress bar and a watch-later toggle.
  - The bar under the stage has Watch later, Add subtitles and Theatre.
  - `t` toggles theatre while focus is in the player.
  - Dropping a `.srt` or `.vtt` file adds it as subtitles.
- **Player store** (`player-store.ts`): holds the registered element, the skin controls, theatre (a device pref) and `playerActions`, and frees subtitle tracks on unmount.
- **`<MediaSurface onControls>`:** fullscreen and PiP go through the skin's own store, so its buttons stay in step. `<MediaSurface>` is still the only Video.js importer.
- **Palette:** a Player group (play/pause K, ±10 s J/L, speed > <, PiP I, fullscreen F, theatre T), plus Continue entries in the Media group.
- **Media Session arbiter** (`lib/media/session-owner.ts`, tested): the last started owns the keys and the metadata. Starting one pauses the others, which is V60's `pause` mode (duck and mix come in T64). Release hands the keys back to the previous owner. `components/speech/media-session.tsx` now claims through it, and `use-player.ts` claims for video.
- **CHANGELOG:** six Unreleased lines. **SPEC:** T62 ticked.

## Verification (actual results)

- Tripwire clean, typecheck clean, 1217/1217 tests (118 files), eslint clean on every touched file. The production build passes.
- **Bug caught in the browser:** saving a position replaced the cached item object, and the players' effects were keyed on it. So every 5 s save re-set the source (back to 0 s) and released the Media Session. Fix: players freeze the item at mount. The stage already keys players by item id.
- **Browser** (demo mode, production build on :3043, Chrome):
  - Big Buck Bunny paused at 104.4 s. After hopping to another item and back, the new element seeked to 104.4 s on `loadedmetadata`.
  - The 52 s trailer, left at 31 s, starts from 0 (inside the last 30 s, V55).
  - Media Session: title "Sintel (trailer)", playing, then paused.
  - The SRT sidecar shows "Hello from **SRT** `<script>x</script>`": bold kept, script printed as text.
  - Theatre made the grid one column.
  - The Watch later section appears.
  - The palette Player group lists 8 commands with their hints. "Faster" set the speed to 1.25×.
  - No console errors.

## Review state

- **Pass 1 (`wanheda-2a`): LGTM with nits.** No FIXes. All four nits were taken:
  1. **A source swap now resumes again.** An `emptied` listener resets `resumed`, so a native load error that falls back to remux on the same element seeks back to the saved place instead of overwriting it with ~5 s.
  2. **`continueList` uses `resumeAt(...) > 0`**, so an item it would open at 0 (inside the last 30 s) isn't listed. Tested.
  3. **`watched` is sticky:** rewatching never un-marks an item (only a future explicit unmark would).
  4. **Arbiter:** a new claim that isn't playing yet waits below a playing owner, so speech loading no longer takes the keys from a playing video for a second. Tested.
- Gates after the nits: tripwire clean, typecheck clean, 1218/1218 tests, eslint clean.
- Nit 1 isn't browser-tested (a native load error is hard to fake); it is a one-listener change.

## Decisions made

- **Watch later is a column (0010), not a playlist.** Playlists are fp-keyed and belong to music (T66). A queue needs only a time.
- **Speed, PiP, fullscreen and seek use the Video.js skin's own keys and menus.** Only theatre (`t`) is ours. The palette shows the skin's keys.
- **V60 `pause` mode is live now** for speech and video. Duck and mix, and the Settings → Sound choice, are T64.
- **Embeds are not tracked.** There's no position from an iframe without the provider's API.

## Known problems and risks

- **0009 and 0010 aren't applied.** In owner mode the library fails to load until the owner runs `bun run db:migrate`. Local positions still save on the device and are sent once the tables exist.
- **The merged remote branch `phase-7/media-core` still exists.** Deleting it was denied by the auto-mode classifier. The owner can delete it.
- **Resume and progress were tested in demo mode only** (memory store; no Dexie, no server writes). The owner path needs the migrations.
- **The flaky test is still unnamed.** It didn't show in today's later runs.

## Next steps (in order)

1. **Done:** review, LGTM with nits (all taken).
2. Commit, push and open the PR. The Reviewer runs the tip check after the push, then merge (the owner's word this session). Forged-check main afterwards.
3. The owner runs `bun run db:migrate` (0009 and 0010).
4. T63 `phase-7/music-library`.

## Files to stage (by name)

`CHANGELOG.md`, `SPEC.md`, `drizzle/0010_media_watch_later.sql`, `drizzle/meta/0010_snapshot.json`, `drizzle/meta/_journal.json`, `lib/db/schema/media.ts`, `lib/media/{types,media,store,seed,local,playback,playback.test,session-owner,session-owner.test}.ts`, `actions/media.ts`, `app/api/media/progress/route.ts`, `components/media/{media-app,media-surface,stage}.tsx`, `components/media/{use-media,playback-store,player-store,player-store.test,use-playback-tracking,use-player}.ts`, `components/speech/media-session.tsx`, `components/shell/command-palette.tsx`, `docs/handoff/2026-11-07-phase-7-video.md`, `docs/handoff/LATEST.md`.

## Env / services touched

- No database writes.
- The demo server on :3043 was stopped. The owner's `next dev` on :3000 was left alone.
- Fixtures (`clip.*`, `clip.srt`) are in the session scratchpad.

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill; read-only.
One pass, bugs and edge cases only, verdict LGTM / LGTM with nits / FIX to wanheda-90.
Target: the uncommitted T62 diff on phase-7/video (files in docs/handoff/2026-11-07-phase-7-video.md).
Check: V55 (resume window, watched, newest wins, beacon route safety), the 0010 migration, the Media
Session arbiter (speech + video, pause mode, hand-back), item freezing in players, subtitles as text.
```

### Builder prompt (T63)

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda (lean mode). Start from docs/handoff/LATEST.md;
verify (git, tripwire, typecheck, tests). Build T63 `phase-7/music-library` (SPEC V58, V62): folder pick +
reconnect, scan worker (music-metadata, recheck newest >= 7 d, supply-chain read), Dexie wanheda-media index
(bump the version), covers in OPFS, incremental rescan + transfer activity, browse + search, virtualised
lists, demo seed library of generated tones. CHANGELOG lines in the same commit.
```
