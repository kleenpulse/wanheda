# Hand-off — Phase 8: desktop media (T80, bundled ffmpeg)

| | |
|---|---|
| Date | 2026-11-11 |
| Phase / checkpoint | P8 CP7: T80 reviewed, PR #95 open |
| Branch | `phase-8/desktop-media` off `main` at `51c0efa`, pushed |
| HEAD | `f4fb077` — feat(desktop): play AC3, E-AC3 and DTS video with a bundled ffmpeg (T80), then this hand-off's commit |
| Previous hand-off | docs/handoff/2026-11-11-phase-8-v0.7.2.md |

## State in one paragraph

The desktop app can now play a video whose sound Chrome can't decode (AC3, E-AC3, DTS). The pinned LGPL ffmpeg sits in `desktop/.ffmpeg/` (ignored), is staged into `resources/media/`, and main runs it per request: video copied, audio to stereo AAC, fragmented MP4 on stdout, served on `wanheda-transcode:` and appended by the media worker to the same MSE buffer the remux uses. Nothing is written to disk. The code is committed (`f4fb077`), reviewed (LGTM with nits) and open as PR #95. It has not yet been tried in the owner's own app, and the owner merges.

## Done this session

- T80, committed as `f4fb077`:
  - Fetch and pin: `desktop/ffmpeg-pin.ts`, `desktop/scripts/zip-entry.ts`, `desktop/scripts/fetch-ffmpeg.ts` (in `desktop:setup`), `.gitignore` (`/desktop/.ffmpeg/`).
  - Ship: `desktop/scripts/stage.ts`, `verify.ts`, `build.ts`, `desktop/electron-builder.yml`, `desktop/tsconfig.json`, `package.json` (the `desktop:setup` script).
  - Main: `desktop/transcode.ts` (pure), `desktop/transcode-io.ts`, `desktop/main.ts`, `desktop/bridge.ts`, `desktop/preload.ts`.
  - Page: `lib/media/ladder.ts`, `lib/media/engine-protocol.ts`, `lib/media/engine.worker.ts`, `lib/platform/media.ts`, `lib/platform/desktop.ts`, `lib/security/csp.ts`, `components/media/stage.tsx`.
  - Tests: `desktop/transcode.test.ts`, `desktop/scripts/zip-entry.test.ts`, `desktop/scripts/verify.test.ts`, `lib/media/ladder.test.ts`, `lib/security/csp.test.ts`.
  - Docs: `SPEC.md` (V74 amended, T80 done), ADR-0014 (T80 amendment with the measurements), `desktop/README.md`, `CHANGELOG.md` (one Added entry), this file, `LATEST.md`.
- The owner-approved ffmpeg fetch ran once: 54.8 MB by Range (the exe's entry only, plus the 2.6 KB licence), not the 169 MB zip. It dropped once at 42 MB and carried on.
- Detour: `tsconfig.json` now excludes `brag-output*`. An ignored `/brag` work folder had a `.ts` file that failed the root typecheck.

## Verification (actual results)

- `bun run tripwire`: clean. `bun run typecheck`: clean. `bun run desktop:typecheck`: clean.
- `bun run test`: 179 files, 1815 passed (was 177 and 1777).
- ESLint on every touched file: clean.
- `bun run desktop:stage` (a full `next build`, then staging): passed; `.stage/media` verified against the pin. The tree it built also held the other session's uncommitted tooltip edits (see below).
- Scratch harness outside the repo (Electron 45.2.0 with the real worker, ladder, `transcode-io.ts` and the pinned ffmpeg, generated 640×360 fixtures): AC3 Matroska, AC3 MPEG-TS and DTS Matroska all planned as "can't play" on the web's caps and as transcode with the desktop's; first frame in 454, 322 and 181 ms; audio decoded; a seek to 41.3 s started a new job at the keyframe; closing the worker, and destroying the window mid-stream, left 0 ffmpeg processes; a track that doesn't exist answered 500 and a missing file 404.
- Not run: the real app end to end (pick a folder, play a real film), the picked-file grant (`webUtils.getPathForFile`), E-AC3, a listen to the 5.1 downmix, `desktop:build` (the installer and its new size), `desktop:smoke`, e2e.

## Review (one pass, LGTM with nits, no FIXes)

- Folded in: a failed codec query is asked again, not cached for the run (main and page); `.part` downloads are named for the pin; a comment in `transcode.ts`; a request aborted while ffmpeg is starting kills its job through `request.signal` (not run in Electron).
- Left open, both listed in the PR body:
  - `desktop/transcode-io.ts` `serve()`: if Electron neither aborts the signal nor destroys the body of a request dropped before the first byte, one ffmpeg can stay until the next request, a navigation or quit. Suggested fix: a first-read watchdog. The owner's seek-and-close check covers it.
  - ffmpeg dying mid-stream reads as a clean end, so the film stops short with no message. The fix must hold the stream's end until the exit code is known ("exit" and stdout's "close" come in either order), and needs the Electron harness.
- After the nits: tripwire, both typechecks clean; 179 files, 1815 tests pass; forged-commit check clean.

## Also on this branch (after the review)

- Videos tab (`7ad9f1d`, then `380d98a`): the library is shown as the folders its videos were added from. A folder tile opens in place (`?folder=`), the player's Back lands in that folder, loose videos sit after the folders. `folderGroups` and `folderLabel` in `lib/media/episodes.ts`; `FolderCard` in `components/media/media-cards.tsx`; `components/media/videos-grid.tsx`, `watch-nav.ts`. Folders are flat (one tile per folder that holds videos), newest add first: the Builder's choice, not yet confirmed by the owner.
- Adding a folder no longer opens its first video (`components/media/add-bar.tsx`). A picked file, a pasted link and a dropped file still open what was added; the owner was told and may want those quiet too.
- Dark toasts were see-through over pictures (`dark:bg-card-nested`, white at 4.5%): they now use the menus' glass fill and blur (`components/ui/toaster.tsx`).
- The page no longer shifts when the scrollbar comes and goes: `scrollbar-gutter: stable` on the document under `[data-shell]` (ShellFrame and ShellFallback), and Radix's scroll-lock margin is cancelled there (`app/globals.css`).
- Media add bar (`50a9785`): Open a file and Open a folder sit on the link field's row, after its + (`components/media/add-bar.tsx`). Open nit: the folder button's "Adding 12 of 74…" label can re-wrap the row mid-import.
- One smart field (`3069a39`): the Videos tab's link box and search box are one (`field` on `AddBar`). `readEntry` in `lib/media/entry.ts` decides: words search, a link adds, a pasted path looks the file up by name. The add bar beside the player and on Home stays link-only. Open nit: the hint line's `aria-live` mounts with its text.
- Reviewer: LGTM (with nits) on each. Open nits: "All folders" replaces the URL while opening pushed it (one dead Back press); focus isn't moved when a folder opens or closes; with the page scroll-locked a `fixed inset-0` scrim stops 6 px short of the window's right edge (needs eyes: the command palette, the player's theatre mode).
- None of this was seen on screen by the Builder (no browser tool this session).
- A test clip for T80 is at `D:UsersskyepVideos	80-test-eac3.mkv` (3 min, HEVC 10-bit video, E-AC3 sound only). The owner's Videos folder has no AC3 or DTS file; its 13 E-AC3 episodes default to an AAC track, so they never convert.

## In progress / not finished

- PR #95 is open and unmerged.
- **The checkout is shared.** Another session has uncommitted tooltip work in the same tree (about 20 files under `components/`, and the two "Changed" lines in `CHANGELOG.md`). None of it is T80's. It was left unstaged: `f4fb077` holds T80's files only, and of `CHANGELOG.md` only the "Added" entry. Any later commit here must do the same.

## Decisions made

All in ADR-0014's T80 amendment and SPEC V74:

- Range-read fetch of two zip entries; per-file size and sha256 pins; `--full` for a whole-zip cross-check (CI should use it in T81, since the per-file pins came from a Range read).
- No temporary file: ffmpeg's stdout is the response body, and the worker's MSE buffer does the rest.
- Tracks by position (`0:V:n`, `0:a:n`), because ffmpeg gives Matroska tracks no id.
- `-seek_timestamp 1` with a half-millisecond nudge, so a seek lands on the keyframe the worker asked for.
- Stereo AAC at 192 kb/s; Opus not used.
- The build is LGPL v3 (not 2.1); its licence text ships next to it.

## Bugs found

- None in shipped code.

## Known problems and risks

- If Mediabunny and ffmpeg count a file's tracks differently (a track one of them skips), the wrong audio track would be converted. Not seen.
- HEVC video copied into MP4 keeps ffmpeg's default tag; whether Chrome's MSE takes it with the probe's codec string is untested (the fixtures are H.264).
- The installer grows by about 45 to 52 MB (ADR-0014's estimate); not measured, because `desktop:build` was not run.
- `desktop:stage`, `desktop:preview` and `desktop:build` now stop if `desktop/.ffmpeg/` doesn't hold the pinned files. CI doesn't stage yet (T81 adds that, and its first fetch).
- In the scratch harness only, a page on `http://localhost:<port>` failed to load (`ERR_FAILED`) while `127.0.0.1` worked. The real app has loaded `localhost` since T75, so this is likely the harness; worth one look if the app ever fails to start.

## Next steps (in order)

1. Owner: `bun run desktop:preview`, add a video folder with an AC3 or DTS film, play it, seek, close it; check Task Manager shows no ffmpeg left.
2. Owner merges PR #95. If the Task Manager check shows an ffmpeg left behind, fix the first open nit before merging.
3. Then T81 (desktop release: updater, CI workflow with `fetch-ffmpeg.ts --full`).
