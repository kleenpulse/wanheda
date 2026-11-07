# Hand-off: mouse wheel on the volume control

| | |
|---|---|
| Date | 2026-11-07 |
| Phase / checkpoint | Phase 7 follow-up, `fix/volume-wheel` |
| Branch | `fix/volume-wheel` (off `main` at `4e3c6f9`) |
| HEAD | `4e3c6f9` (the work sits on top) |
| Previous hand-off | docs/handoff/2026-11-07-money-input.md (PR #54, open at the time) |

## State in one paragraph

The user sent a screen recording: scrolling over the island card's volume rocker scrolled the page behind and left the volume alone. Now the wheel anywhere over the rocker (the mute button or the slider) turns the volume, and the page doesn't move. One notch is one 5 % step (the slider's own step), a trackpad's small deltas add up, and Ctrl+wheel is left alone for the browser's zoom. The rocker is the one `VolumeRocker` in `components/media/now-playing-card.tsx`, so the island card, the `media.player` window and Home's widget all get it.

## Done

- `lib/media/volume.ts`: `WHEEL_STEP` (0.05) and `wheelSteps(carry, deltaY, deltaMode)` (100 px a notch; lines ×40, pages ×800; turning back the other way drops the carry; never −0), with a test.
- `VolumeRocker`: a native `wheel` listener with `{ passive: false }` (React's `onWheel` is passive, so it can't `preventDefault`), calling the store's `nudgeVolume`. Turning up from mute unmutes, as the keys already do.
- Reviewer nits (wanheda-5f, LGTM with nits), both taken: a mostly sideways swipe (|deltaX| > |deltaY|) is left alone, so a trackpad's back/forward swipe still works; and a wheel within 300 ms of any scroll (a capturing `scroll` listener on window) belongs to that scroll, so a Home page scroll glides over the widget's rocker instead of stopping and turning the volume.
- CHANGELOG Fixed line, put in the middle of the list so it can't conflict with PR #54's CHANGELOG edits.
- `LATEST.md` is **not** touched on this branch, also to avoid a conflict with PR #54. Once both are merged, the next session points LATEST at the newest hand-off.
- Browser (demo prod build, Chrome, music hopped onto Money): 3 notches down 100 → 85 %, 1 up over the mute button → 90 %, 5 × 20 px → 95 %, scrollY stays 0 throughout; a sideways swipe leaves the volume; a page scroll that reaches the rocker keeps scrolling and leaves the volume, and 500 ms later a notch turns it again; off the card the page still scrolls (12/12 PASS).
- Lint: 17 errors in files this branch doesn't touch (reader workers, speech, settings voices, weather widget). The same 17 show on clean `main`; lint never gates.

## Next

Reviewer's post-push check on the PR. The user merges it (and PR #54); then point LATEST.md at the newest hand-off.
