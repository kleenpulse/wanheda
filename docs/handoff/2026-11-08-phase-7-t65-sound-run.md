# Hand-off — Phase 7: T65 owner checks — Sound run, 6 PRs merged

| | |
|---|---|
| Date | 2026-11-08 |
| Phase / checkpoint | Phase 7 exit (T65): owner checks 1–3 pass; check 4 (Sound modes) to rerun; 5–7 not run |
| Branch | `docs/handoff-t65-sound` (this doc + `LATEST.md` only) |
| HEAD | `a9f726c2564612d68eaaa773d650a29f1c38c06e` — Merge pull request #73 from kleenpulse/feat/wheel-sliders |
| Previous hand-off | docs/handoff/2026-11-08-phase-7-media-home-built.md |

## State in one paragraph
The session started the T65 owner checks on `main` @ `e4dd43d` (#66 and #67 main checks passed). Checks 1 (video keys), 2 (read-aloud keys) and 3 (island: music + read-aloud + timer) **passed**. Check 4 (Settings → Sound) **failed** in pause mode, and that led to B25 and two refinements the owner asked for. Six PRs were merged: #68–#73. #72 and #73 were merged by the Builder **on the owner's explicit word** ("merge the PRs"); the others by the owner. `main` is at `a9f726c`, clean, 145 files / 1501 tests. T65 is **not** ticked yet.

## Done this session
- **#68** `fix/speech-volume-amy`: read-aloud volume rocker (device pref `wanheda-speech-volume`, Piper gain live, Web Speech per utterance); the rocker moved to `components/media/volume-rocker.tsx` (`VolumeTarget`); Amy (`en_US-amy-medium`) added to the voice catalog, pinned to `b4e358f` and flagged non-commercial; Settings → Sound card gap. SPEC V46, V49.
- **#69** `feat/dock-reopen-speech`: Reader in the dock, while on `/reader` and speaking, opens or raises the `reader.speech` mini window.
- **#70** `fix/recent-cards`: Media Home's Recently played album and folder-mix cards match the Most played card (full-bleed cover, 14 px, held state).
- **#71** `fix/speech-pause-resume` (**B25**): in pause mode, what speech paused plays again when speech lets go; `SessionClaim.resume`; the speech claim is held per `live`, not per title. Reviewer FIX: a hand-started video was hijacked by the music's resume; fixed.
- **#72** `feat/sound-fade`: arbiter pause/resume fade (`SOUND_FADE` out 0.3 s / in 0.6 s). Music has its own fade GainNode; video uses `elementFader`, which aims at `videoVolumePref`. Plus: **the owner's speech pause lets the music back in** (`endInterruption()`), the sleep timer's pause does not (`pause({ sleep: true })`, store `slept`). Reviewer FIX ×2 on the video fader, fixed.
- **#73** `feat/wheel-sliders`: `hooks/use-wheel-steps.ts`; the mouse wheel tunes every range slider (rocker `wheel` prop removed; music and video seek 5 s a notch; Settings → Reader auto-scroll speed). SPEC V66.
- Owner help, not code: Amy copied from companion-tts (`%APPDATA%\com.vxrcel.companion-tts\piper`, sha256 = pins) into `:3000`'s OPFS with a console snippet (Chrome refuses `AppData` in the picker, so via `Downloads\amy-voice`). `wanheda-voices` was **missing entirely** on `:3000`, so Lessac is gone from that origin too.
- Memory: `wheel-tunes-every-slider` (owner rule).

## Verification (actual results)
- `main` @ `a9f726c`: typecheck clean; `bun run test` 145 files / 1501 tests pass; tripwire clean; forged-commits clean on `dd5858e..a9f726c`.
- Every PR: Reviewer (`wanheda-bc`) diff review, tip check PASS; main checks PASS for #68, #69, #70, #71, and #72 + #73 on `a9f726c` (merge trees = checked tip trees).
- Not browser-checked by the Builder: everything was checked by the owner on `:3000` (their `next dev` serves this checkout).

## In progress / not finished
- **T65 check 4** to rerun on `main`: pause (music fades out under reading, fades back in on pause **and** stop; sleep-timer pause keeps it paused), duck, mix; keys reach whoever speaks.
- **T65 checks 5–7** not run: `meta.folder` survives a reload against Neon; a lapsed folder permission shows the Play card; with a real music folder, plays persist, a rescan prunes a deleted file, an unplugged drive keeps history.
- Uncommitted: none on `main`. This branch holds only this doc and `LATEST.md`.

## Decisions made
- Speech is an interruption (V60, B25): an owner pause, stop or end lets held music/video play again; the sleep timer doesn't; a hand start ends the wait. A music/video start pauses the other for good.
- Fades only on the arbiter's pause/resume; the owner's own pause/play stays instant.
- The mouse wheel tunes every slider, never opted out (owner rule; V66 amended).
- Amy kept in the catalog despite "License: See URL" (owner's word; flagged).

## Bugs found
- **B25** (§B): pause mode never resumed what speech paused. V60 amended (several times; read it whole).
- Not a code bug: the browser voice was silent because Windows SAPI output (`HKCU\Software\Microsoft\Speech\AudioOutput`) is pinned to "Speakers/Headphones", not the device Chrome plays to. Piper avoids it.

## Known problems and risks
- Reviewer nit open on purpose (#73): a fast wheel spin on a seek bar seeks once per notch (music: engine restart per notch; remuxed video: remux restart). Coalesce if the owner hears stutter.
- Reviewer nits open on purpose (#69): no visual pulse when the read-aloud window is already front-most; the nav rail and phone tab bar don't reopen it.
- Music resumed after its engine closed (the `startAt` path) comes in at full, without a fade (rare; in V60).
- `:3000` had no voices in OPFS (Lessac lost, cause unknown: site-data clear or eviction).
- The owner's screen recordings carry no audio (Windows recorder setting), so a sound bug needs a description, not only a clip.

## Next steps (in order)
1. Owner reruns T65 check 4 (pause, duck, mix) on `main`, then checks 5–7.
2. Any fail ⇒ a fix branch with backprop (§B/§V). All pass ⇒ tick T65 in SPEC.md, write the Phase 7 done hand-off with the Phase 8 prompts (FRD §10.0), point LATEST at it.
3. The Phase 7 minor release (`bun run bump minor`) only on the owner's word.

## Files to read first
- `D:\Vxrcel\wanheda\FRD.md` (local only) §10.0 and the Phase 8 section
- SPEC.md §T (T65), §V (V60 whole, V66), §B (B25)
- `lib/media/session-owner.ts`, `components/speech/media-session.tsx`, `lib/media/music-engine.ts` (fade), `components/media/use-player.ts` (`elementFader`)

## Env / services touched
- None: no env vars, no migrations, no Neon or R2 changes.

## Review state
- Reviewer: `wanheda-bc`. #68–#73 all reviewed and merged; main checks PASS for all six. Tip checks PASS for all, except #70: its tip check on `3d7d9e2` found a CHANGELOG conflict with #69; the merge from main (`234c12d`, both bullets kept) was merged before its own tip check, and the Reviewer verified that merge delta in the #70 main check instead.
