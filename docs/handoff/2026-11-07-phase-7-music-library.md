# Hand-off — Phase 7: Media — music library (T63)

| | |
|---|---|
| Date | 2026-11-07 |
| Phase / checkpoint | Phase 7 CP4, T63 `phase-7/music-library` |
| Branch | `phase-7/music-library` (off `main` at `17e6016`) |
| HEAD | `17e6016` — Merge pull request #48 (the work is uncommitted on top) |
| Previous hand-off | docs/handoff/2026-11-07-phase-7-video.md |

## State in one paragraph

T62 is merged as PR #48 (`17e6016`), and the Reviewer's post-merge check came back VERIFIED.

T63 is built and checked in the browser:
- a Music tab on /media;
- folder pick, with reconnect on a click;
- a scan worker using `music-metadata`, incremental;
- covers stored in OPFS;
- the Dexie index;
- browse by artist, album, genre or folder, plus search;
- a virtual list;
- the island scan activity and a palette group.

Queued next, from the user via `wanheda-c2`: password-protected PDFs in the Reader, on its own branch. Plan: `C:\Users\skyep\AppData\Local\Temp\claude\5ec96097516841f2\39a8a3ef-e603-439a-b24e-21d580d1ca36\scratchpad\pdf-password-plan.md`.

## Done this session

- **Package:** `music-metadata` 12.3.3, exact pin.
  - It is still the newest release ≥ 7 days old.
  - 12 packages came in. The leaves `file-type` 22.3.0, `@borewit/text-codec` 0.2.3 and `@tokenizer/inflate` 0.6.0 are 9–14 days old, from known maintainers, with no install scripts.
  - IOC regex and `eval` scan: clean.
- **Pure core `lib/media/library.ts`** (10 tests): track fallbacks (title from the file name, "Unknown artist", "Unknown album"), `diffScan` (path + size + mtime), groups in album/disc order, and search that ignores case and accents and needs every word to match.
- **Worker `lib/media/music.worker.ts`:**
  - Walks the folder: an FSA directory handle, or the `webkitdirectory` files with the top folder name dropped.
  - Parses only new or changed files, with `duration: false`.
  - A result with no container and no codec counts as bad. `music-metadata` returns an empty `format` for junk instead of throwing.
  - Covers are stored once per distinct picture as WebP (≤ 512 px) in OPFS `wanheda-covers/`.
  - Results go out in batches.
- **Storage:** Dexie `wanheda-media` v3 adds `tracks` and `folders`; v4 adds `skipped` (files that won't parse, by path + size + mtime, so a rescan doesn't re-read them until they change).
- **Only a kept folder writes to Dexie** (FSA, not demo). A folder-input or demo pick stays in the tab (Reviewer FIX 2).
- **Store `components/media/music-library.ts`:**
  - The folder handle is kept. Permission is checked on load: "Reconnect" if it's needed, otherwise a quiet incremental rescan.
  - A different folder replaces the index.
  - Without FSA, a folder input works for this tab only.
  - Demo shows generated-tone index rows.
- **UI:**
  - `music-view.tsx`: folder bar with scan status, browse (Segmented), search, drill-down, and `VirtualList` (fixed rows, overscan 8).
  - `cover.tsx`: object URLs read from OPFS, cached.
  - The Videos | Music switch in `media-app.tsx` (`?tab=music`).
- **Island:** `scan-activity.tsx` shows only while there are files to read, or when a scan failed. It has Cancel or Dismiss.
- **Palette:** a Music group with search hits once 2 or more characters are typed, plus "Music library".
- **CHANGELOG:** five Unreleased lines. **SPEC:** T63 ticked.

## Verification (actual results)

- Tripwire clean, typecheck clean, 1228/1228 tests, eslint clean on touched files, production build passes.
- **Browser** (demo mode, production build on :3043, Chrome; folder input, since DevTools can't drive `showDirectoryPicker`):
  - Fixture of 6 files (3 tagged MP3s with embedded cover art, 1 tagged FLAC, 1 untagged MP3, 1 junk `.mp3`) ⇒ "5 read, 1 skipped (couldn't be read)".
  - Albums: First LP (3), Unknown album / Unknown artist (1), Waves (1).
  - The First LP drill-down is in track order with header durations (0:04).
  - All three album tracks share one cover, read from OPFS.
  - Searching "ocean" ⇒ "Ocean · Solo Act · Waves".
  - No console errors.
- **Before the junk-file rule,** the junk file was listed as a track. That is what caught the rule.

## Decisions made

- **Our own virtual list, not a package.** Fixed rows are enough here; no new dependency.
- **Opening the app runs a quiet rescan.** It is incremental, so unchanged files cost a stat each. The island stays quiet unless there are files to read.
- **The palette searches only the index already loaded on this device.** Opening the palette never starts a scan.

## Known problems and risks

- **The FSA path wasn't driven by automation:** handle persistence, reconnect after a restart, and "different folder replaces the index". The owner should try it in Chrome.
- **10k-track scroll performance (V62) wasn't measured.** The list renders only about 30 rows.
- **The 13 ms/track timing wasn't re-measured.** That is T60's number.
- **Migrations 0009 and 0010 aren't applied.** A peer (`wanheda-2a`) relayed a go-ahead from the user. The Builder held it, because a peer's message isn't the user, and is asking the user directly.
- **The merged remote branches `phase-7/media-core` and `phase-7/video` are still there.** Deleting them was denied in auto mode; they're the owner's to delete.

## Next steps (in order)

1. Reviewer pass (`wanheda-2a`).
2. On LGTM: commit, push, PR, Reviewer tip check, merge (the owner's word this session).
3. Password-protected PDFs (from `wanheda-c2`'s plan), on its own branch.
4. T64 `phase-7/music-player`.

## Files to stage (by name)

`package.json`, `bun.lock`, `CHANGELOG.md`, `SPEC.md`, `lib/media/{library,library.test,music-protocol,music.worker,music-seed,local}.ts`, `components/media/{music-library,music-library.test}.ts`, `components/media/{music-view,virtual-list,cover,media-app}.tsx`, `components/island/{scan-activity,island}.tsx`, `components/shell/command-palette.tsx`, `docs/handoff/2026-11-07-phase-7-music-library.md`, `docs/handoff/LATEST.md`.

## Env / services touched

- No database writes.
- Demo server on :3043 stopped. The owner's :3000 was left alone.
- Fixtures are in the scratchpad `music-fixture/`.
