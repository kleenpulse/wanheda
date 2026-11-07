# Latest hand-off

**Newest:** [2026-11-07-phase-7-media-core.md](2026-11-07-phase-7-media-core.md). **T61 media core on `phase-7/media-core`: review FIX, then LGTM with nits (all taken); PR next. #44, #45, #46 merged; v0.6.0 tagged on `5e2b8dc`.**

- `/media`: open a file (FSA + input fallback), drop one, or paste a link; YouTube, Vimeo, SoundCloud and Spotify embed from an allowlist, src rebuilt from the id.
- Ladder proven in the browser: MKV H.264 + AAC native, MPEG-TS remuxed (MSE from the worker, seek 74 ms), AC3 MKV says why instead of playing silent.
- Video.js 10.2.0 works in Next 16 cacheComponents; it and Mediabunny load only on demand.
- Migration 0009 is written but **not applied**: the owner runs `bun run db:migrate`.
- T65 exit wording accepted on the owner's behalf while away (overridable).

Next: commit, push, PR and merge (the owner's word for this session), then T62.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests).
