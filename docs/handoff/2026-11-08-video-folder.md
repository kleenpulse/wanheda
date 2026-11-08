# Hand-off: video folders, list media keys, resume choice (T70) — 2026-11-08

| | |
|---|---|
| Date | 2026-11-08 |
| Phase / checkpoint | Phase 7, T65 exit run: owner checks in progress; T70 found on the way |
| Branch | `phase-7/video-folder`, pushed, PR #61, tip `9761f73`, base `main` `fa53701` (#60 wallpapers merged) |
| Previous hand-offs | [2026-11-08-page-wallpapers.md](2026-11-08-page-wallpapers.md) (other session, T69, merged + migrated), [2026-11-07-music-polish.md](2026-11-07-music-polish.md) (T65 check list) |

## State in one paragraph

The owner ran T65's owner checks. **Ear test: passed** (both T65 albums). **Hardware keys: music passed earlier.** On a video, the keys came back with two complaints: prev/next sought ±10 s instead of changing video, and Videos had no folder source. A screen recording then showed rows with progress bars that opened from 0 with no resume prompt. All of it became T70, in one PR (#61): Reviewer `wanheda-bc` gave FIX, then LGTM with nits (twice), then a PASS on the post-push tip check. **#61 is waiting for the owner's merge.** T65 is not ticked.

## What T70 does (PR #61)

- **Keys on a video** (V60 amended): next and prev move through the All list. Embeds are skipped. Prev goes straight back, with no music-style restart-first, so the video you leave keeps its place; at the top it does nothing. Seek keys still step ±10 s. Pieces: `stepItem` (lib/media/media.ts), `usePlayer.step` set by `VideosView`, handlers in `components/media/use-player.ts`.
- **Open a folder:** `videosInFolder` / `videosInFiles` / `fsaFolderPicker` (lib/media/local.ts), `addFolder` (use-media.ts). Videos only. Sub-folders walked; hidden and unreadable ones skipped. Name order, ≤ 500 per pick. Handles kept. One summary toast; "Couldn't read <name>" when the picked folder fails.
- **Layout:** outside theatre, Videos has `data-page-fill` like Music. Side by side (lg), only the list scrolls; the stage is capped by window height (`FILL_STAGE`) and the player column scrolls only as a backstop. Stacked (< lg), the view scrolls as one. The list follows a key step, and focus moves with the playing row.
- **Resume** (V55 amended): cut-offs are min(10 s, 10 %) and min(30 s, 10 %), so short clips resume. A row's bar means it will resume. The device pref `wanheda-video-resume` is set in Settings → Sound → Videos: **Ask** (default: opens paused on the place with a Resume / Start over prompt; play or the play key resumes; a hidden tab resumes), Resume, or Start over. Code: lib/media/resume-mode.ts, use-playback-tracking.ts, `ResumePrompt` in media-app.tsx.
- **Direct links play on open**, like local files.

## Verification

- `main` `fa53701` checked before rebasing (3 commits, +0100, forged-commits clean, fast-forward).
- At the tip: tripwire clean, typecheck clean, 1410 tests (137 files), lint 0 errors in the touched media files.
- Browser probes, demo prod build on :3043 (stopped), Playwright Chrome; scripts in the session scratchpad: folder input + FSA (OPFS stub), unreadable folder, layout at 1920×800 / 1280×800 / 900×900, 12-step follow, and the full Ask / Resume / Start over flow. 0 console errors.

## Next

1. Owner merges #61. Then `git tidy`, and ask `wanheda-bc` for the main check (tree = reviewed tip `9761f73`).
2. T65 owner checks still to run:
   - video keys, with the new behaviour
   - Reader read-aloud keys
   - island: music + read-aloud + timer at once, media and speech first, cycling
   - Settings → Sound: pause, duck and mix, each as music then read-aloud
3. All pass ⇒ tick T65 in SPEC.md, write the Phase 7 done hand-off with the Phase 8 prompts (FRD §10.0), and point LATEST at it. That PR carries this doc, the other untracked hand-offs and LATEST.md.

## Notes

- **Shared checkout:** another session (T69) worked in `D:\Vxrcel\wanheda` at the same time and switched branches under this one. This branch was first created on top of its commits by accident and was reset `--keep` onto `main`. Check `git branch --show-current` before staging.
- Reviewer for this run: `wanheda-bc` (`wanheda-5f` was not running).
- Known and accepted: a very fast double-next inside one render can land on the same item; keys are dead for a moment while the next video opens.
- Not done: a folder watch or rescan for Videos (a second pick adds new files).
- No database writes, migrations, env vars or packages.
