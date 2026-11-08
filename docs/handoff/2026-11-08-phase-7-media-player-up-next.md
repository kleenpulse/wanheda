# Hand-off — Phase 7 follow-up: Cinema player (T72) — step (b) series, up next, autoplay

| | |
|---|---|
| Date | 2026-11-08 |
| Phase / checkpoint | Phase 7 follow-up, T72 step (b) of 4 |
| Branch | `feat/media-player` (off `main` @ `06f327b`), **uncommitted** |
| Previous hand-off | docs/handoff/2026-11-08-phase-7-media-player-chrome.md (step a) |

## State in one paragraph
Videos named like `Show.S01E11…`, `1x11`, `Episode 11` (with the folder as fallback) form a series (`lib/media/episodes.ts`). `stepItem` (media keys, Shift+N|P, Next button) follows `playOrder`: a show in season/episode order, else the library list, and embeds are always skipped. The player has an Up next rail (fanned cards, Season menu, current card with time left), opened by its button or automatically when paused full screen. Autoplay shows a "Next in Ns" card in the last 10 s (or after a short clip ends). The card counts down (and holds while paused), marks the current item watched through the tracker's `finish`, and carries PiP when a click or key moved on. Folder adds now store `meta.folder` (type, zod schema, `toMeta` whitelist, which moved to `lib/media/media.ts` so it's testable).

## Verification (actual results)
- typecheck clean; `lib/media` + `components/media` tests: 211 pass (new: episodes 12, cinema `shouldOfferNext`/`countdownFrom`, media `meta.folder` round trip + series step).
- Browser (demo standalone :3305): `1920x1080.mp4` is not a series; S01E01 near its end → card → autoplay to S01E02, and E01 shows "Watched". Full screen paused: title card "Night Harbor / Season 1 · Episode 1 · HD · 1:15 · MP4 / Episode 1", rail with Season 1|2 menu inside the frame, Season 2 lists "1. The Lighthouse".
- Not checked: PiP carry (needs a real PiP window), the permission-gesture card (needs an FSA handle with lapsed permission).

## Next
Step (c) thumbnails (opfs-image, engine `thumb` job, thumb-queue, YouTube single fetch, opaque tile base), then (d) list restyle, SPEC/CHANGELOG/ADR, full gates, Reviewer.
