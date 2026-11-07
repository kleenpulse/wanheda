# Latest hand-off

**Newest:** [2026-11-07-phase-7-music-player.md](2026-11-07-phase-7-music-player.md). **T64 `phase-7/music-player`: Reviewer LGTM (`wanheda-5f`, after one FIX round), PR next.** `main` is at `89df358` (#52 merged, post-merge VERIFIED).

- Music plays from the Music tab: gapless engine, queue, shuffle and repeat, the Sound setting (pause, duck or mix), and Media Session handover with speech and video.
- The player UI is a port of Motion Garden's LiveActivity media card. It shows in the island, the `media.player` window and Home's `media.now-playing` widget.
- The Music tab opens on Songs (user).
- After the user's recording: the Output chip is gone, the card has a volume rocker, and the equalizer follows the real sound.
- Not browser-checked yet: Settings → Sound, the window, the widget, the new equalizer and volume, and duck by ear.
- Migrations 0009 and 0010 are applied (11 rows in `drizzle.__drizzle_migrations`). All merged remote branches are deleted.
- Queued, waiting for the user's word: `feat/money-input` (plan in the Builder's scratchpad, `money-input-plan.md`).
- Next: T65 Phase 7 exit run.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests).
