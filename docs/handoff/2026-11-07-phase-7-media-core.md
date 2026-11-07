# Hand-off — Phase 7: Media — media core (T61)

| | |
|---|---|
| Date | 2026-11-07 |
| Phase / checkpoint | Phase 7 CP2, T61 `phase-7/media-core` |
| Branch | `phase-7/media-core` (off `main` at `5e2b8dc`) |
| HEAD | `5e2b8dc` — Merge pull request #46 (the work is uncommitted on top) |
| Previous hand-off | docs/handoff/2026-11-07-phase-7-media-spike.md |

## State in one paragraph

T61 is built and checked in the browser; review is next. Since the last hand-off:
- PR #44 (T60 spike), #45 (changelog and release flow) and #46 (release v0.6.0) are all merged.
- v0.6.0 is tagged on `5e2b8dc`. `wanheda-c2` cut it and is done in this tree.

T61 adds:
- Migration `0009_media` (written, **not applied**).
- A pure `lib/media/` core with tests, and `lib/platform/media.ts`.
- A media worker that fingerprints, probes and remuxes.
- The `/media` app: library, add bar, stage.
- `<MediaSurface>` on Video.js 10.2.0.
- The remux island activity and the palette's "Play …" group.

The owner was asleep and told the Builder to answer questions itself, to commit, push, open the PR and merge on the Reviewer's LGTM, and then go on to the next task.

## Done this session

- **Verified on start:** main = origin/main; forged-commit check clean (`abc2d91..HEAD`, then `b1ef33f..origin/main`). Tripwire clean, typecheck clean, 1113/1113 tests.
- **Packages:**
  - `@videojs/react` 10.2.0 and `mediabunny` 1.65.0 are still the newest releases ≥ 7 days old (10.3.0 is 3.6 days old; mediabunny 1.65.1 and 1.65.2 are under 5 days).
  - 13 packages installed. All were read in the T60 supply-chain pass; the ranged leaves (`react-compiler-runtime` 1.0.0, `signal-polyfill` 0.2.2, `@types/dom-*`) are old.
  - The provider peers are optional and none is installed.
  - IOC regex and `eval`/`new Function` scan of the installed folders: clean.
  - `music-metadata` waits for T63.
- **Schema:** `media_item` (unique `(user_id, fp)`, kind/source checks), `playback_state` (FK to the item on `(id, user_id)`), and `playlist` + `playlist_track` (keyed by fp, for T66). All tables have RLS on. File: `drizzle/0009_media.sql`, plus its snapshot and journal entry.
- **`lib/media/` (pure, tested):**
  - `ladder.ts`: `planPlayback`. Every chosen track is checked. Native play is only for the default tracks; a non-default track means remux; a native load error falls back to remux; transcode is only for a codec in `transcodable`, which is empty until T66; otherwise "cannot", naming the codec and the track.
  - `url.ts`: the embed allowlist. The iframe src is always rebuilt from the provider id.
  - `fingerprint.ts`, `subtitles.ts` (SRT → VTT), `resume.ts`.
  - `media.ts`: write schemas. A local fp must be 64 hex characters. For a URL or an embed, the fp must equal what the uri parses to. `r2` is refused. `meta` is strict, so no iframe src is ever stored.
- **Worker** (`engine.worker.ts`):
  - On open, it fingerprints and probes the file in parallel.
  - The remux goes into a MediaSource the worker owns, handed to the page as `MediaSource.handle`.
  - Copies are forced (no transcode).
  - It buffers up to 30 s ahead of playback (back-pressure on the write stream) and trims anything more than 20 s behind.
  - A seek past the buffered range restarts the remux from the keyframe at or before the target (`EncodedPacketSink.getKeyPacket`), with `timestampOffset` set to that keyframe.
- **Client:**
  - `use-media.ts`: TanStack Query cache and optimistic add. Delete commits only when the undo toast expires. The engine is lazy-imported, so the palette doesn't pull it in.
  - `local.ts`: FSA handles kept in Dexie `wanheda-media` by fp, plus a per-tab map. Covers "permission needed" and "Not on this device" with relink by fp.
  - `use-file-pick.tsx`: FSA picker with an `<input>` fallback.
  - `stage.tsx`: the ladder runs here. Sets `src`/`srcObject` through one helper. The native-error fallback runs once.
- **App wiring:** the `MEDIA` manifest (the rail, tab bar and dock pick it up). The palette lists up to 5 recent items from the cache. `remux-activity.tsx` joins the island after 1 s of a slow start, with Cancel.
- **CHANGELOG:** six Unreleased lines under Added.
- **SPEC:** T61 ticked, with build notes.
- **Detour fix:** the demo seed URLs. Google's `gtv-videos-bucket` samples now return 403. The seed now uses the Blender Foundation's CC BY films: Big Buck Bunny via the Wikimedia 480p VP9 transcode, and the Sintel trailer from download.blender.org, plus one YouTube embed.

## Verification (actual results)

- **Tripwire:** clean. **Typecheck:** clean. **Lint** on all new and touched files: 0 problems (the repo-wide lint still has its old errors; lint doesn't gate).
- **Tests:** 1190 in 113 files at pass 1; **1204 in 115 files after the review fixes** (91 media tests). Five full runs: 4 clean, 1 with one failure. The failing test's name wasn't captured, and it didn't come back in 3 more runs. This is probably the uncaught Phase 6 flake, but it isn't proven.
- **Build:** passes. `/media` is a partial prerender.
  - The Video.js chunk (250 KB raw) and the Mediabunny chunk (584 KB raw, worker only) are in no page's client-reference manifest, so both load on demand.
  - Only `/media` lists the 25 KB stage chunk.
- **Browser run:** demo mode, production build served with `next start` on :3043, Chrome through the DevTools MCP. The owner's `next dev` holds :3000 for this directory, so a second dev server can't start.
  - **Direct link:** the Sintel trailer plays (854 px wide, readyState 4). Video.js works inside Next 16 with cacheComponents.
  - **YouTube embed:** plays through `youtube-nocookie`.
  - **Dead link:** the old 403 seed showed "That link didn't play".
  - **Local files** (FSA picker hidden in the tab so the `<input>` fallback could be driven; fixtures were made with ffmpeg in the scratchpad):
    - MPEG-TS → remux. `srcObject` is a MediaSourceHandle and audio is decoded (64 KB). Buffered 0–38 s at t = 6.9 s. Seeking to 52 s took 74 ms to `seeked`, and the old range was trimmed to 32–48.
    - AC3 MKV → "Audio track 1 is Dolby Digital (AC3), which this browser can't play."
    - MKV H.264 + AAC → native (blob URL, audio decoded).
  - **Exit log:** `localStorage["wanheda:media-log"] = "1"` prints the rung used: remux, cannot, native. The flag was cleared afterwards.

## Review state

- **Pass 1 (`wanheda-2a`, diff-reviewer): FIX ×3 + 3 nits.** All taken:
  - **FIX 1, two quick seeks ⇒ two live jobs.** Fixed with `JobSlot` (`lib/media/remux-plan.ts`): the new job is swapped in synchronously, before the old one's cancel is awaited. Test: a deferred cancel with two `replace()` calls leaves exactly one live job.
  - **FIX 2, stall after a seek back into an old range.** Fixed with the pure `needsRestart(ranges, t, head, endS)`: restart unless `t`'s range is the one being written (the job's head comes from `onMoof`) or already reaches the file's end. `restartFrom` refills only the gap. The page also sends `seek(currentTime)` on `waiting` as a backstop. Tested with the reviewer's example.
  - **FIX 3, a ghost island card after a fast failure.** Fixed with `slowRemuxNotice(job)` in `remux-status.ts`, which returns `end()` (clears the timer and the card). It's called on failure, on first frame and on unmount. Tested with fake timers.
  - **Nit 1:** `append` rechecks cancellation after `waitIdle`.
  - **Nit 2:** with no track choice and an unplayable default audio track, the ladder takes the first audio track that plays once remuxed. Choosing the AC3 track explicitly still says why it can't play. Tested.
  - **Nit 3 was a real bug and is fixed.** The first job relied on Mediabunny's default trim, so its output was shifted to start at 0 by the TS start offset (~1.4 s); a restart's `timestampOffset` used source time. The pass-1 browser numbers showed it: after the seek the buffer began at 51.43 = 50 + 1.4. There is now one timeline: element time = source time − `base` (the chosen tracks' first timestamp). Every job trims from an explicit source time and sets `timestampOffset` to its element time. `MediaSource.duration` = duration − base (the TS now reads 60.03 s, not 61.48).
- **Re-verified in the browser** (demo, prod build, :3043): on the TS, a frame drawn at 53 s by a restart job (range starting on the keyframe at 52.00) hashes the same as the frame from the continuous run (1587995034). The seek back to 20.5 s also matched (4061130005). Then a fresh buffer [0, 34], seek to 50, seek back to 31, play: it crossed 34 s with no stall and the buffer joined into [29.99, 60.03]. No console errors.
- The MP4 and the TS of the same source differ by a frame or two at the same time. The TS has no edit list for the H.264 B-frame delay. A/V sync within the file is kept, so this is not a remux bug.
- **Pass 2 (`wanheda-2a`): LGTM with nits.** One new nit, taken: `waiting` restarted a job that hadn't written yet, which doubled the work at every start and seek. A job now carries `[from, until)`, and `needsRestart` leaves a job with no head alone for a stall inside that window. `waiting` is ignored while `el.seeking`. Checked in the browser by counting the worker's `appended` messages: 1 job at start and 1 per seek (at 0, then 48.02 for a seek to 50). Tests 1205/1205.
- **Process note from the reviewer:** its verdict covers commit, push and PR only, because CLAUDE.md and the saved preference keep the merge with the owner. The owner's message this session said: "on peer's LGTM commit > push >PR > merge> next task > repeat". The Builder follows that, and the merge is recorded here.

## Decisions made

- **The T65 exit wording is accepted** (asked of the owner at T60; the owner was away and delegated answers). Reason: today's run shows the reworded test is the meaningful one. Chrome plays MKV natively, the remux is proven on MPEG-TS, and AC3 says why it can't play. The owner can still override it.
- **No rename in T61.** The spec doesn't ask for it, so it wasn't built (a server action no screen uses would be dead code).
- **The embed iframe src is never stored.** It's rebuilt from `uri` on every render, so a forged row can't frame an arbitrary page.
- **`playback_state` is keyed by item id**, with the composite FK on `(id, user_id)`. Items are unique by fp, so a relink keeps the same row.
- **Duration for remux:** `MediaSource.duration` is set from the probe. An MPEG-TS starting at about 1.4 s shows 61.5 s for a 60 s clip. That's cosmetic and left as it is.

## Known problems and risks

- **`db:migrate` hasn't been run.** Owner mode needs migration 0009 applied before `/media` can save; until then a save reports "failed". This needs the owner's go-ahead.
- **The FSA path wasn't driven by automation.** DevTools can't intercept `showOpenFilePicker`. Handle storage, the permission re-grant and relink after a reload are still to be tried by hand in the owner's Chrome.
- **Remux on the owner's real 2 GB MKV wasn't re-measured.** T60 measured it in the harness, and T65 covers it.
- **The flaky test is still unnamed:** one failure in five full runs.
- **No "play without sound" for AC3 files.** Possible later; not in the spec.

## Next steps (in order)

1. **Done:** Reviewer FIX, then LGTM with nits (all taken).
2. Commit, push, open the PR and merge (the owner's word for this session). Then forged-check main.
3. The owner runs `bun run db:migrate` for 0009 (their go-ahead only).
4. T62 `phase-7/video`: resume and watched, speed, PiP, keyboard shortcuts, the watch-later queue, the continue list, subtitles, and the video Media Session owner.

## Files to stage (by name)

`package.json`, `bun.lock`, `CHANGELOG.md`, `SPEC.md`, `drizzle/0009_media.sql`, `drizzle/meta/0009_snapshot.json`, `drizzle/meta/_journal.json`, `lib/db/schema/index.ts`, `lib/db/schema/media.ts`, `lib/modules.ts`, `lib/media/` (types, ladder, url, fingerprint, subtitles, resume, media, store, server, seed, local, engine-protocol, engine.worker, remux-plan, and the 7 test files), `lib/platform/media.ts`, `lib/platform/media.test.ts`, `actions/media.ts`, `app/api/media/route.ts`, `app/(shell)/media/page.tsx`, `components/media/` (media-app, stage, media-surface, use-media, use-file-pick, remux-status, remux-status.test), `components/island/remux-activity.tsx`, `components/island/island.tsx`, `components/shell/command-palette.tsx`, `docs/handoff/2026-11-07-phase-7-media-core.md`, `docs/handoff/LATEST.md`.

## Env / services touched

- No database writes, and no migration applied.
- The `next start` demo server on :3043 was stopped. The owner's `next dev` on :3000 was left alone.
- Chrome MCP profile: tab on :3043/media. The `wanheda:media-log` flag was cleared.
- Fixtures are in the session scratchpad `media-fixtures/` (not committed).

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only. One pass, bugs and edge cases only, verdict LGTM / LGTM with nits / FIX, sent to the
Builder (wanheda-90). Your LGTM is not the user's approval.
Target: the uncommitted T61 diff on branch phase-7/media-core (files in
docs/handoff/2026-11-07-phase-7-media-core.md).
Check: SPEC V51–V54, V56; migration 0009 (FKs, uniques, RLS); write schema can't store a non-allowlisted
embed or a mismatched fp; the ladder's AC3 case and native→remux fallback; the worker's seek/cancel races
and MSE abort/timestampOffset; Video.js and Mediabunny stay out of shell chunks; package pins and lockfile.
```

### Builder prompt (T62)

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda (lean mode, one checkpoint, no worktrees;
rules in CLAUDE.md and docs/handoff/README.md). Start from docs/handoff/LATEST.md; verify (git, tripwire,
typecheck, tests). Build T62 `phase-7/video` (SPEC V55, V57, V60): resume ∧ watched (lib/media/resume.ts
exists), speed, PiP, theatre|fullscreen, shortcuts in the palette, watch-later, continue list, VTT + SRT
sidecar (lib/media/subtitles.ts exists), video as Media Session owner. Migration 0009 must be applied by
the owner first. CHANGELOG Unreleased lines in the same commit.
```
