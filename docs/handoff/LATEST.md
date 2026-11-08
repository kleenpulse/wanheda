# Latest hand-off

**In progress:** [2026-11-08-phase-7-media-player-built.md](2026-11-08-phase-7-media-player-built.md) (steps: [a](2026-11-08-phase-7-media-player-chrome.md), [b](2026-11-08-phase-7-media-player-up-next.md)). **T72 Cinema player built on `feat/media-player`, uncommitted, awaiting the Reviewer (`wanheda-bc`); T73 Media Home = PR 2, next session.** PR #64 has since merged (`main` @ `06f327b`). Note: video keys for T65 now come from the new chrome (player-keys.ts).

**Before it:** [2026-11-08-aurora-edge.md](2026-11-08-aurora-edge.md). **#62 (T71 Aurora from top|bottom) and #63 (Money/Income tabs at the right edge, closer to the sheet) are merged; `main` is at `7cdccbb`. Migration 0012 is applied (`user_prefs.aurora_edge`, 13 rows in `__drizzle_migrations`).** Reviewer's main check on `7cdccbb` passed; `git tidy` run (only `phase-7/exit` left, never pushed). **PR #64 `fix/money-stat-overflow` (tip `53b04cf`, Reviewer LGTM) is open:** Money totals one per row until `@4xl`, amounts `min(30px, 2.6cqi)` across; plus SPEC T69/T71 → x. No migration. The user merges it.

**Also today:** [2026-11-08-video-folder.md](2026-11-08-video-folder.md). **PR #61 `phase-7/video-folder` (T70: video next/prev walk the list, Open a folder, Music-style scrolling, resume Ask | Resume | Start over) is merged (`da3c9e3`).**

**Before that:** [2026-11-08-page-wallpapers.md](2026-11-08-page-wallpapers.md) (T69, #60 merged at `fa53701`, migration 0011 applied) and [2026-11-07-music-polish.md](2026-11-07-music-polish.md) (#58, #59; the T65 check list is in [2026-11-07-phase-7-exit-machine.md](2026-11-07-phase-7-exit-machine.md)).

- T65 owner checks: the ear test **passed**, music keys **passed**. Still to run: video keys (new behaviour), read-aloud keys, the island, and Sound mode. All pass ⇒ tick T65 and write the Phase 7 done hand-off with the Phase 8 prompts. Any fail ⇒ a fix branch.
- After each merge: `git tidy` (local alias), and ask the Reviewer (`wanheda-bc` this run) for the main check.
- The checkout may be shared with another session: check the branch before staging.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests).
