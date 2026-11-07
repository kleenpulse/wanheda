# Latest hand-off

**Newest:** [2026-11-07-phase-7-media-spike.md](2026-11-07-phase-7-media-spike.md). **Phase 7 planned (V51–V62, T60–T66); T60 engine spike done; docs only. Review: FIX, then delta LGTM. Committed on `phase-7/media-spike`, PR open; the merge is the user's.**

- Video.js v10 is GA (2026-10-01), so Phase 7 uses `@videojs/react` 10.2.0, not Vidstack (ADR-0013, ADR-0006 amended).
- Chrome plays MKV (H.264 + AAC) natively. The remux (Mediabunny → fragmented MP4 → MSE from a worker) covers containers Chrome refuses: MPEG-TS, first frame 293 ms.
- An AC3 MKV plays as silent video with no error, so the probe checks every track's codec.
- Gapless music = Mediabunny streaming clipped to exact duration, exact in every format tested. Hardware media keys reach a Web Audio-only page.
- Settings → Sound (pause | duck | mix) added to the plan (user).
- The T65 exit wording changed (MKV native; remux proven on MPEG-TS). The owner should confirm.

Next: the user merges the PR (and confirms the T65 exit wording). `wanheda-c2` has been told the PR is up. After the merge, T61 starts in a new session.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests). The Reviewer prompt and the T61 Builder prompt are in the hand-off.
