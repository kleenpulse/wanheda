# Hand-off: Phase 7 CP5, music player (T64)

| | |
|---|---|
| Date | 2026-11-07 |
| Phase / checkpoint | Phase 7 CP5, `phase-7/music-player` (T64) |
| Branch | `phase-7/music-player` (off `main` at `89df358`) |
| HEAD | `89df358`, Merge pull request #52 (the work is uncommitted on top) |
| Previous hand-off | docs/handoff/2026-11-07-mobile-tabbar-overflow.md |

## State in one paragraph

T64 is built and waiting for the Reviewer (`wanheda-2a`). Music plays from the Music tab: a click on a song starts it and queues the rest of the list. The engine streams and clips each track and schedules them gapless on one AudioContext. The queue has shuffle and repeat. Music shares the tab's Media Session with speech and video through the arbiter, which now has the Sound setting's pause, duck and mix modes. The player UI is a port of Motion Garden's LiveActivity media card (the user's design). It shows in the island, the new `media.player` window and Home's new `media.now-playing` widget. Mid-build the user also asked for the Music tab to open on Songs; that is done.

## Done

- **Pure modules in `lib/media/`, all tested:**
  - `lame.ts`: ID3 size, the LAME delay and padding, the MP3 tail (`max(0, padding − 529)`) and `clipChunk`.
  - `queue.ts`: start, shuffle (Fisher–Yates over the rest, current track first; off restores the list order), repeat off|all|one (repeat one applies only when a track ends on its own), prev|next, `upNext`.
  - `tones.ts`: the demo tones. "Gapless Run" is one chirp, phase-continuous across its 3 parts, so a gap would be audible.
  - `sound-mix.ts`: the `wanheda-sound-mix` device pref (`mode` or `mode:level`; junk falls back to the default), `startPauses`, `duckGain`, `rampAt`.
- **`lib/media/music-engine.ts`** (dynamic import only, so no Mediabunny in the shell):
  - Mediabunny `AudioBufferSink` streamed; chunks clipped to `[from, end]`.
  - The next track starts at the previous track's `endsAt` on the context clock, with at most 8 s scheduled ahead.
  - A seam log through `console.debug("[music] seam …")`.
  - A duck GainNode ramped with `DUCK_RAMP` (new in `lib/motion.ts`).
  - An AnalyserNode after the duck, so the equalizer shows the sound as heard.
  - `setVolume` glides over 15 ms and is kept for the next graph.
  - 5 failures in a row stop the queue.
- **`lib/media/session-owner.ts`:**
  - It reads a mix getter (the pref).
  - Video and music always pause each other. Speech pauses them only in `pause` mode.
  - `claim.duck(gain)` is called on a change only.
  - `refresh()` runs when the pref changes.
  - Video ducks its element volume through an interval ramp (`use-player.ts`), so the ramp still finishes in a hidden tab.
- **`components/media/music-player.ts`:**
  - The store lives in the shell, so playback survives app hops.
  - Its controls: `playList`, `jump`, `toggle`, `next`, `prev`, `seek`, `stop`, shuffle, repeat, `setVolume`, `nudgeVolume`, `toggleMute`. `musicLevels()` exposes the analyser.
  - Position updates at 4 Hz while playing.
  - Music claims the session as owner.
  - When the queue ends, it goes back to the queue's top, paused.
- **`music-library.ts`:** `musicFile(path)` walks the FSA folder or takes this tab's input files, and asks for permission again on the click when needed. `relativeMusicPath` is shared with the worker.
- **UI:**
  - `now-playing-card.tsx` is ported from `shadow-garden/components/registry/live-activity/activities.tsx`: MediaCard, WaveProgress and Equalizer. Colours are island tokens and the wave is a CSS mask. The scrub is a range input for seeking. The header shows the folder name ("Test tones" in demo).
  - After the user's screen recording (2026-11-07): the Output chip is removed, and a volume rocker (mute and slider) takes its slot.
  - The equalizer was motion `scaleY` keyframes, frozen as 4 dots on the owner's machine. It is now the analyser's spectrum in 4 log bands (`lib/media/levels.ts`), painted per frame. Then "more energy" (user): each bar reads mostly its band's peak, a per-bar auto-gain stretches its recent floor and ceiling to full height, analyser smoothing is 0.2, and the bars rise 0.85 and fall 0.28 per frame. It rests on a pause. Reduced motion shows still bars, not dots.
  - Volume is the device pref `wanheda-music-volume` (`lib/media/volume.ts`): the gain is the level squared, and turning it up from mute unmutes. The palette has mute and volume up/down.
  - Island: `media-activity.tsx`. The pill shows the art and the equalizer; the card is the now-playing card.
  - Island order: `lib/activity/priority.ts` `rankActivities` (V61).
  - Window: `music-window.tsx`.
  - Widget: `now-playing-widget.tsx`, in the seed layouts at all 3 breakpoints. Idle, it offers "Shuffle N songs".
  - Settings: `sound-section.tsx` (`?s=sound`). The level row shows only for duck.
  - Dock: Media shows as running while music plays.
  - Palette: a "Music player" group, the Sound modes under Settings, and a song hit now plays the song with its album queued.
  - Music tab rows are buttons with a current-row state. The default browse is Songs.
- **Island in dark mode** (user, screenshot, then a recording): `live-activity.tsx` adds `dark:shadow-[0_0_34px_-6px_var(--glow)]`, the blur part of the logo's glow only. The user asked for no border, and the `shadow-glow` token also draws a 1px outline, so it isn't used.
- **Island morph** (user: "too snappy, make it butter smooth"): `ISLAND_SPRING` and `ISLAND_CONTENT_IN` in `lib/motion.ts`, chosen per direction. Open: spring `visualDuration` 0.55, `bounce` 0.32; content delay 0.2, duration 0.36. Close (and pill swaps): spring 0.42, `bounce` 0.25; content delay 0.14, duration 0.28. A first try with `bounce` 0.08 lost the spring; the user asked for it back. The `stiffness` and `damping` props are gone.
- **Reviewer FIX round (`wanheda-5f`), all applied:**
  - **FIX 1:** `release()` calls `duck(1)` on a ducked claim before dropping it, so music played again after a stop isn't stuck at the duck level. Video's `elementDucker.dispose()` restores the owner's volume at once on unmount.
  - **FIX 2:** `startAt` plays only if, when the engine arrives, the store is still playing the same item from the same start (`startedAt`). A pause during the cold import now wins.
  - **Nit:** a `FolderAccessError` from `musicFile` becomes `PlayError({ stop: true })`, which stops the queue at once instead of 5 toasts and 5 permission prompts.
  - **Nit:** the wave scrub commits on `pointercancel`.
  - **Tests:** a release-lifts-duck test and a cold-engine pause test (`components/media/music-player.test.ts`).
- **CHANGELOG:** 10 Unreleased → Added lines and 2 → Fixed (the island glow, the smoother morph).

## Verification (actual results)

- Tripwire clean, typecheck clean, eslint 0 errors on the touched files. The 3 warnings are `<img>` for OPFS object URLs, the same as `cover.tsx` already has. Production build passes (demo env).
- **Tests 1295/1295** after the FIX round. Before that: **1291/1291** after the volume and equalizer changes; build passes.
- **Earlier, 1282/1282.** One full run before that had 2 failures in `components/money/money-runtime.test.ts` (outbox retry timing). The file passes alone (22/22), and the next full run passed. It is a flake under load, outside this branch.
- **Browser** (demo, prod build :3043, Chrome):
  - Songs is the default browse.
  - Clicking "Chirp, part 1" lights the row. The island shows the art and the equalizer. The dock marks Media as running.
  - Seam log: `seam into item 2: 0.000 ms` and `seam into item 3: 0.000 ms`.
  - The queue ran on to Duty Cycle.
  - The island card matches the design. The time moved from 00:00 to 00:14.
  - Media Session: "Duty Cycle" / "Square Wave Club" / `playing`. After Pause: `paused`, and the scrub held at 19 s.
- **Not browser-checked:** the session restarted and DevTools didn't reconnect.
  - Settings → Sound, the player window and the Home widget.
  - The analyser equalizer and the volume rocker.
  - Duck and mix by ear, against speech.
  - A real MP3's tail trim (fixture test only).
  - Hardware keys. They are T65's job anyway.

## Next steps (in order)

1. Reviewer pass (`wanheda-2a`).
2. On LGTM: commit (staged by name), push, open the PR, tip check, merge, then ask for the main check.
3. T65 Phase 7 exit run on the owner's machine: gapless by ear, keys ×3, speech over music per mode.
4. Queued by peer `wanheda-c2`, not yet confirmed by the user: `feat/money-input` ("give all money input boxes brains"). The plan is copied to the Builder's session scratchpad, `money-input-plan.md`.

## Files to stage (by name)

`CHANGELOG.md`, `SPEC.md`, `components/island/island.tsx`, `components/island/live-activity.tsx`, `components/island/media-activity.tsx`, `components/media/cover.tsx`, `components/media/music-controls.tsx`, `components/media/music-library.ts`, `components/media/music-player.ts`, `components/media/music-player.test.ts`, `components/media/music-view.tsx`, `components/media/now-playing-card.tsx`, `components/media/use-player.ts`, `components/settings/settings-board.tsx`, `components/settings/sound-section.tsx`, `components/shell/command-palette.tsx`, `components/shell/dock.tsx`, `components/speech/speech-controls.tsx`, `components/widgets/index.tsx`, `components/widgets/now-playing-widget.tsx`, `components/windows/music-window.tsx`, `components/windows/window-layer.tsx`, `lib/activity/priority.ts`, `lib/activity/priority.test.ts`, `lib/board/layout.ts`, `lib/media/lame.ts`, `lib/media/lame.test.ts`, `lib/media/levels.ts`, `lib/media/levels.test.ts`, `lib/media/library.ts`, `lib/media/music-engine.ts`, `lib/media/music.worker.ts`, `lib/media/queue.ts`, `lib/media/queue.test.ts`, `lib/media/session-owner.ts`, `lib/media/session-owner.test.ts`, `lib/media/sound-mix.ts`, `lib/media/sound-mix.test.ts`, `lib/media/tones.ts`, `lib/media/tones.test.ts`, `lib/media/volume.ts`, `lib/media/volume.test.ts`, `lib/modules.ts`, `lib/motion.ts`, `docs/handoff/2026-11-07-phase-7-music-player.md`, `docs/handoff/LATEST.md`.
