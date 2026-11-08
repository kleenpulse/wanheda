# Hand-off — Phase 7 follow-up: Cinema player (T72) — step (a) chrome + keys + captions

| | |
|---|---|
| Date | 2026-11-08 |
| Phase / checkpoint | Phase 7 follow-up, T72 step (a) of 4 |
| Branch | `feat/media-player` (off `main` @ `06f327b`), **uncommitted** |
| HEAD | `06f327b` — Merge pull request #64 |
| Previous hand-off | docs/handoff/2026-11-08-aurora-edge.md |
| Plan | `C:\Users\skyep\.claude\plans\your-the-expert-ui-ux-snappy-iverson.md` (rev 3, Reviewer wanheda-bc: LGTM with nits; user approved) |

## State in one paragraph
Video.js's stock skin is gone. `media-surface.tsx` only hosts the `<video>` (still the sole `@videojs/react` importer). The player's own chrome (`video-chrome.tsx`) sits in `CinemaFrame`, the stage wrapper in `media-app.tsx`, which also holds `ResumePrompt` (now `z-20`). The frame is what goes full screen, and menus, tooltips and the status line all render inside it. Controls include: centre −10/play/+10, a scrub bar painted from the element with a hover time bubble and a frame preview (native local files), play, next, volume (own device pref), subtitles menu, settings menu (speed, caption size, autoplay pref, save frame, shortcuts), fit/fill, PiP, theatre, full screen. Auto-hide is `inert` when hidden. Keys come from the pure `lib/media/player-keys.ts`. Captions are drawn by the app (`captions-layer.tsx`): tracks stay `hidden`, and the layer sits above the measured control stack.

## Done this step (all uncommitted)
- New: `lib/media/player-keys.ts` (+test), `lib/media/cinema.ts` (+test: resolution label, clock, time left, prefs), `lib/media/video-store.ts` (+test: stable snapshot), `components/media/video-chrome.tsx`, `video-scrub.tsx`, `video-menus.tsx`, `captions-layer.tsx`.
- Changed: `media-surface.tsx` (no skin), `player-store.ts` (root, failed, releases/onRelease, track/lastTrack/setTrack, notify + status; `addSubtitles` → hidden track), `stage.tsx` (fullscreen classes via `group/cinema`, `setFailed`), `use-player.ts` (`applyVideoVolume`), `media-app.tsx` (CinemaFrame; subtitles/theatre chips and the `t` handler removed), `ui/menu.tsx` (radio, checkbox, group label, submenu; `container` accepts undefined), `ui/tooltip.tsx` + `ui/select.tsx` (`container`).

## Verification (actual results)
- `bun run typecheck`: clean. `bun run test`: 140 files, 1429 tests pass.
- `bun run build` (demo env): clean.
- Browser (Chrome DevTools MCP, demo standalone on :3305, 1440×900, Nebula): local MP4 plays; click pauses; controls hide `inert` while playing; full screen keeps top bar, centre trio, meta line (`HD · 1:15 · MP4`), scrub, settings menu, status line ("Frame saved…") inside the frame; an SRT added through the chrome shows as hidden track with drawn cues (tags stripped, `&` decoded).
- Not yet checked: every key, reduced motion, phone width, light theme, PiP.

## How to run a demo server while the owner's `next dev` holds the folder
`next dev` locks `.next/dev/lock` per folder. Build with empty real-data env vars (`DATABASE_URL= … bun run build`), copy `.next/standalone/.`, `.next/static` and `public` into the scratchpad, delete any `.env*` in the copy, then `PORT=3305 HOSTNAME=127.0.0.1 node server.js` with the same empty vars. Rebuild + recopy after each change. File inputs: un-hide `input[name=media-file]` / `input[name=subtitles]` with a script, then `upload_file`.

## Next
Step (b): `lib/media/episodes.ts` (+false-positive tests), `upNext` / `stepItem`, `meta.folder` (types + `toMeta` + schema + round-trip test), `shouldOfferNext`, autoplay card, up-next rail, Season select, PiP carry. Then (c) thumbnails, (d) list restyle, SPEC/CHANGELOG, Reviewer.
