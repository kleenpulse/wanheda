# Hand-off — Phase 7: Media — plan + engine spike (T60)

| | |
|---|---|
| Date | 2026-11-07 |
| Phase / checkpoint | Phase 7 planned (V51–V62, T60–T66); CP1 T60 spike done |
| Branch | `phase-7/media-spike` (off `main` at `abc2d91`) |
| HEAD | `abc2d91` — Merge pull request #43 (the work is uncommitted on top) |
| Previous hand-off | docs/handoff/2026-11-07-phase-6-done.md |

## State in one paragraph

Phase 7 is planned in `SPEC.md`: invariants V51–V62 and tasks T60–T66. The T60 spike is done, and its results are in ADR-0013, an amended ADR-0006 and a note in ADR-0007. The main findings:
- **Video.js v10 is GA** (2026-10-01), and Vidstack is in security-only maintenance. Phase 7 uses `@videojs/react` 10.2.0.
- **Chrome now plays MKV (H.264 + AAC) natively.** The remux path (Mediabunny → fragmented MP4 → MSE from a worker) is for containers Chrome refuses, such as MPEG-TS, and starts in about 0.3 s.
- **An AC3 MKV plays as silent video with no error**, so the probe must check every track's codec.
- **Gapless music is Mediabunny streaming clipped to each track's exact duration.** That's exact for every format tested. `decodeAudioData` would hold a whole 67-minute mix (1.55 GB).
- **Hardware media keys reach a Web Audio-only page**, once Chrome is the media session Windows is listening to.

The owner added a Settings → Sound choice (pause | duck | mix) to V60 and T64. Docs only: no code and no package changes.

## Done this session

- **Verified on start:**
  - `main` = `origin/main` = `abc2d91`. Forged-commit check on `117a64e..origin/main` clean (2 commits).
  - Tripwire clean, typecheck clean, 1101/1101 tests in 105 files.
- **Plan:**
  - V51–V62: player, ladder, remux, identity, resume, URLs and embeds, subtitles, library, playback, audible owner + Sound setting, island priority, performance.
  - T60–T66: spike, media-core, video, music-library, music-player, exit, later.
  - User edits:
    - Sound choices in Settings (V60, T64), a device pref: `pause` (default) | `duck` (20 / 35 / 50 %) | `mix`. Video and music always pause each other.
    - T65 tries all three modes.
- **Spike T60 (harness in the scratchpad, outside the repo):**
  - **Supply-chain read:** a resolver script took the newest version ≥ 7 days old for each range, checked every tarball's sha512, and extracted 28 packages. All clean: no install-time scripts, no worm indicators, no `eval` or `new Function`, no telemetry.
  - **Measurements** (in ADR-0013):
    - Video.js in React: mount 115 ms, first frame 158 ms, about 75 KB gzipped JS plus 10 KB CSS.
    - 2 GB MKV: native 145 ms; MSE remux first frame 138 ms; seek to 600 s 295 ms; 0 frames dropped while playing.
    - MPEG-TS remux: 293 ms.
    - Gapless: chirp fixtures in 5 formats. Every format is exact after clipping. For MP3, the tail is the LAME `padding − 529`.
    - Media keys: pass (owner).
    - Tags: 26/26 parsed, 13 ms each.
    - Neon Object Storage re-reviewed.
- **Docs:**
  - `docs/adr/0013-media-engines.md` (new);
  - ADR-0006 amended (Vidstack → Video.js v10, MKV now native, the silent-AC3 trap);
  - ADR-0007 note (R2 kept; Neon as a no-card fallback);
  - ADR README index;
  - SPEC: V51–V53 and V58–V60 amended with T60 numbers, T60 ticked, T61 and T65 updated.

## Verification (actual results)

- Tripwire clean after the edits. The indicator regex finds nothing in `SPEC.md` or `docs/adr/`.
- Typecheck and tests weren't rerun after the edits: docs only, and no code changed since the start-of-session run (1101/1101).
- The spike numbers are from Chrome (DevTools MCP profile) on the owner's laptop, with the harness at `127.0.0.1:4777`, now stopped. The fixtures are in the session scratchpad.

## Decisions made

- **Video.js v10, not Vidstack** (the FRD Phase 7 rule: start on v10 if it has shipped).
- **Remux = fragmented MP4 into MSE from a worker.** No OPFS file and no remux cache.
- **Gapless = streamed and clipped.** Not `decodeAudioData` on whole tracks, because of memory.
- **No `<audio>` element is needed for media keys.**
- **The exit test is reworded (T65).** "MKV plays after remux" can't force the remux path any more, because Chrome plays such an MKV natively. T65 now reads: the MKV plays with no full transcode, the remux path is proven on MPEG-TS, and an AC3 MKV says why it can't play instead of playing silent. **The owner should confirm this reading.**
- **R2 stays the upload target. Neon Object Storage is the no-card fallback.** Uploads stay off (V38).

## Known problems and risks

- **Media keys depend on Windows.** Windows gives them to one app's media session at a time. A YouTube tab playing in Brave kept them even with Chrome focused, and the owner had to close it. A page can't fix this. Phase 8 global shortcuts can.
- **The trims were checked on test files only.** Real gapless albums are still to be tried; the exit run does that. Many of the owner's MP3s have a zeroed LAME tag (`Lavc60.3`, delay 0, padding 0) or none, so they get no tail trim. That's correct for singles.
- **Video.js inside Next 16 (cacheComponents) wasn't tried.** A `next dev` from this repo was running on :3000 (the owner's or `wanheda-c2`'s), and a test route would have hot-reloaded into it. T61's build proves it. The package is marked `"use client"` throughout, and we load it with `dynamic(..., { ssr: false })`, as react-pdf was.
- **The OPFS file remux path wasn't measured.** MSE made it unnecessary.
- **Video.js releases often** (10.0 to 10.3 in five weeks). Re-check the newest ≥ 7-day version at the T61 install.
- **The flaky test from Phase 6 is still uncaught.**

## Next steps (in order)

1. **Done:** Reviewer FIX, then delta LGTM. Committed, pushed and PR opened (lean mode). The merge is the user's.
2. **Tell `wanheda-c2` once the PR is up.** It's waiting to branch `chore/release-flow` from main, and it won't touch this tree until then.
3. After the merge, T61 (`phase-7/media-core`) starts in a fresh session.
4. Changelog: from T61 on, a plain-English line under `## [Unreleased]` for every user-visible change. Until c2's release-flow PR merges, send the lines to c2. Versioning (user): one minor per phase, so the Phase 7 exit is v0.7.0. Never edit `version` in `package.json`; the cut is the user's.

## Files to stage (by name)

`SPEC.md`, `docs/adr/0013-media-engines.md`, `docs/adr/0006-media-native-remux-transcode.md`, `docs/adr/0007-object-storage-cloudflare-r2.md`, `docs/adr/README.md`, `docs/handoff/2026-11-07-phase-7-media-spike.md`, `docs/handoff/LATEST.md`.

## Env / services touched

- None in the repo.
- Spike server on 127.0.0.1:4777, stopped.
- Chrome (MCP profile): a "media spike" tab on :4777, and the Wanheda tab on :3000 left alone. Nothing was written to OPFS (the file remux wasn't run).
- The owner closed a Brave tab during the keys test.

## Review state

- **Pass 1 (`wanheda-2a`, diff-reviewer): FIX.**
  - FIX 1: migration number 0008 was taken (`0008_reader_prefs.sql`), so it is now 0009.
  - FIX 2: four stale lines in ADR-0006, now struck or annotated.
  - Nits taken, all 5: a duplicated V60 clause; the MP3 tail is `max(0, padding − 529)` from the LAME extension; native iff the default tracks pass, and a non-default track means a remux; `fp` is the identity key for every source (NOT NULL); the ADR-0013 AAC seam sentence.
- **Delta pass: LGTM.** Both FIXes and the 5 nits verified, nothing else changed, tripwire clean.

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only. One pass, bugs and edge cases only, verdict LGTM / LGTM with nits / FIX, sent to the
Builder (wanheda-90). Your LGTM is not the user's approval.
Target: the uncommitted T60 diff on branch phase-7/media-spike (docs only; files in
docs/handoff/2026-11-07-phase-7-media-spike.md).
Check: V51–V62 and T60–T66 are consistent with each other and with FRD §6.5 / Phase 7; the T65
exit rewording (MKV native in Chrome, remux proven on MPEG-TS) keeps the FRD's intent; ADR-0013's
numbers match the hand-off; ADR-0006/0007 amendments; no literal worm markers; no package.json change.
```

### Builder prompt (T61)

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda (lean mode, one checkpoint,
no worktrees; rules in CLAUDE.md and docs/handoff/README.md).
Start from docs/handoff/LATEST.md → docs/handoff/2026-11-07-phase-7-media-spike.md; verify (git,
tripwire, typecheck, tests). Forged-check the T60 merge range before pulling main.
Build T61 `phase-7/media-core` (SPEC V51–V54, V56, ADR-0013): migration 0009 (db:migrate only on
the user's go-ahead), lib/media pure + tests, /media app, <MediaSurface> on Video.js v10, ladder,
MSE remux worker. Re-check each package is the newest ≥ 7 d before install; pin exact.
Send CHANGELOG Unreleased lines per the hand-off.
```
