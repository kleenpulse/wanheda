# Hand-off: Phase 7 exit run (T65), machine half done

| | |
|---|---|
| Date | 2026-11-07 |
| Phase / checkpoint | Phase 7, T65 exit run: machine checks done, owner checks pending |
| Branch | `phase-7/exit` (off `main` at `fc54563`), only this doc and `LATEST.md`, uncommitted |
| HEAD | `fc54563`, Merge pull request #57 (OPay logo) |
| Previous hand-off | docs/handoff/2026-11-07-volume-wheel.md |

## State in one paragraph

Every open PR is merged: #56 (LATEST pointer), #57 (OPay accounts show the OPay logo). The Reviewer (`wanheda-5f`) verified `main` after #54, #56 and #57. T65's machine checks all pass on a demo production build in Chrome (Playwright, `channel: "chrome"`). The owner's checks (ear, hardware keys, speech in the island, speech over music per Sound mode) haven't been run yet. T65 isn't ticked in SPEC.md, and there's no Phase 7 done hand-off yet.

## Done this session

- PR #56 `docs/latest-after-54-55`: LATEST pointed at the volume-wheel hand-off. Merged.
- PR #57 `feat/opay-logo` (user request): `lib/money/account-logo.ts` brand table matched on the account name (`o[-\s]?pay`, not Opayo), `AccountMark` shared by the accounts list and the breakdown by account, `next/image` at 36 px, `public/opay-logo.jpg`. Reviewer LGTM with 1 nit (taken: "O Pay"). Merged.
- Owner question on Money (screen recording): the numbers were right. An opening balance is money the account already held, so it never counts as Received. The owner understands and moved on. Offered, not built: a hint under the opening balance field ("Money the account already had. Got it this month? Add it as Money in."). Build it only on the owner's word.
- Local merged branches deleted (`feat/money-input`, `docs/latest-after-54-55`, `feat/opay-logo`).

## T65 results (machine half)

Demo production build, `next start` on :3043 with the real-data keys set to empty strings. Chrome headless via Playwright, FSA pickers deleted in an init script so the `<input>` fallbacks are driven, `localStorage["wanheda:media-log"] = "1"`.

| T65 check | Result |
|---|---|
| MKV (H.264 + AAC) plays without a transcode | Pass. `native`, blob URL, 1280x720, audio decoded |
| Remux on a container Chrome refuses (MPEG-TS) | Pass. `remux`, `srcObject` = MediaSourceHandle, 0 dropped frames, audio decoded |
| AC3 MKV says why, not silent | Pass. `cannot`: "Audio track 1 is Dolby Digital (AC3), which this browser can't play." |
| Transcode never called | Pass. No transcode path exists |
| Owner's real MKV (`Ramparts of Ice 6.mkv`, 288 MB, HEVC Main 10 + 2x HE-AAC + 39 SRT) | `native`: Chrome on the owner's GPU decodes HEVC 10-bit. 1920x1080, ready in 669 ms, 0 dropped frames, audio decoded |
| Gapless: \|start(n+1) − end(n)\| ≤ 1 ms | Pass. `[music] seam into item 1: 0.000 ms` on the WAV album and on the LAME MP3 album |
| Island: media + timer at once, by priority, cycling | Pass. Music "1 of 5", 5 min timer "2 of 5", then the 2 demo alerts; about 6 s per step |

- The owner's `C:\Users\skyep\Music` has no album (26 loose tracks), so a 2-track album was cut from `Clouds_Beautiful_Chill_Music.mp3` at exactly 45.000 s (sample 1,984,500): a WAV version and a LAME MP3 version (ffprobe reads 45.000 s on both, so the delay and padding header is there).
- The seam log is the scheduler's view. It can't see a wrong MP3 trim (doubled or missing samples), so the owner's ear test is still needed.
- Fixtures and the script are in this session's scratchpad: `C:\Users\skyep\AppData\Local\Temp\claude\5ec96097516841f2\4489e580-d066-44eb-a290-9e1d0b39b256\scratchpad\t65\` (`album-wav\`, `album-mp3\`, `video\`, `run.ts`: `bun run.ts video|music|island|hevc`). Not committed.

## Verification

- `main` at `fc54563`: incoming checked before each pull, forged-commits clean, tripwire clean.
- On the #57 tip: typecheck pass, 1378 tests pass (133 files), tripwire clean, `bun run build` pass.
- Lint: the same 17 pre-existing errors; lint doesn't gate.

## Next steps (in order)

1. The owner runs the 4 checks in their own Chrome (where the Piper voices live). Close other media apps first.
   1. Ear: Media → Music → pick `...\scratchpad\t65\album-wav`, play "Clouds part 1", seek to ~0:40, listen across 0:45. Then `album-mp3`. Fail if there's a click, dip or repeat.
   2. Hardware keys play/pause and next: music, a video, Reader read-aloud.
   3. Island: music + read-aloud + a timer at once. All three show, media and speech first, and the island cycles.
   4. Settings → Sound, once for each of pause, duck and mix: music, then read-aloud. Pause = music pauses and comes back; duck = music drops to the duck level; mix = both at full. The keys reach whatever is speaking.
2. Any failure: a fix branch, with §B and §V via the backprop skill.
3. All pass: tick T65 in SPEC.md, write `2026-11-..-phase-7-done.md` with the Phase 8 prompts (FRD §10.0 template), and point LATEST at it. Reviewer, then commit, push and PR. The Phase 7 minor release is cut only on the owner's word (`bun run bump minor`).

## Files to read first

- SPEC.md §T (T65), §V (V52, V53, V59, V60, V61)
- `D:\Vxrcel\wanheda\FRD.md` (local only) §10.0 for the phase-done template, and the Phase 8 section
- `lib/media/music-engine.ts` (seam log), `lib/media/session-owner.ts` (key handover), `lib/activity/priority.ts` (island order)

## Env / services touched

- No database writes, no migrations, no new env vars. Demo servers on :3043 were stopped. The owner's :3000 was left alone.

## Review state

- #56 and #57: Reviewer LGTM, push check VERIFIED, merged by the owner. Main check: VERIFIED for both (#57: merge tree 8460f12 = reviewed tip tree).
- Reviewer for T65: `wanheda-5f`.
