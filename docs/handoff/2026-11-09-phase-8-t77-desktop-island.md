# Hand-off — Phase 8: Desktop — T77 desktop island

| | |
|---|---|
| Date | 2026-11-09 |
| Phase / checkpoint | P8 CP4: T77 floating island built and checked in preview; T77 ticked |
| Branch | `phase-8/desktop-island` (off `main` at `6ec41dc`), Reviewer LGTM, committed for a PR |
| HEAD at start | `6ec41dc` — Merge pull request #81 from kleenpulse/phase-8/desktop-native |
| Previous hand-off | docs/handoff/2026-11-09-phase-8-t76-desktop-native.md |

## State in one paragraph
T76 merged as PR #81 (`6ec41dc`) after wanheda-87's FIX, re-review, push check and main check. That follows the owner's standing go-ahead for this run: on LGTM, commit, push, open the PR, merge, then the next task. T77 is built.

While the main window is hidden, minimised or unfocused, a transparent island window floats at the top centre of its display. It shows what's live:
- music, read-aloud, transfers and alerts, from the main page's snapshot;
- timers, from the shared activity store.

Its buttons work, and clicks pass through everywhere else. The page's own island steps aside meanwhile, and Settings → Desktop has the island switch. Reviewer wanheda-87: FIX ×2 (island in gated mode, zoom) fixed, then LGTM.

## Done this session
- **Desktop:**
  - `island.ts` (new, pure): parsers for the snapshot, commands and reports; the show rule; placement; hit-testing.
  - `bridge.ts`: 7 island channels, `Command` `island`, `DesktopChange` and `DesktopState` gain `island`.
  - `settings.ts`: `island` (default on).
  - `preload.ts`: `window.wanheda.island`.
  - `main.ts`:
    - `createIslandWindow` (transparent, `focusable: false`, `screen-saver` level, `showInactive`, ignores the mouse by default, not throttled);
    - `updateIsland` on the main window's focus, blur, show, hide, minimise and restore;
    - `trackIslandCursor`, a 30 Hz poll only while the island shows, with `setIgnoreMouseEvents` plus hover sent to the renderer;
    - island handlers with `fromWindow`;
    - the snapshot reset on a main-window navigation;
    - the floating state re-sent when a page says it's ready;
    - the island destroyed with the main window and made again with it.
- **Web:**
  - `lib/island/snapshot.ts` (+ test).
  - `components/island/`:
    - `island-mirror.tsx` publishes at most 4 times a second, latest wins, deduped;
    - `floating-island.tsx` renders the window and reports its rect at 10 Hz, only on change;
    - `floating-store.ts`;
    - `activity-sync.ts`, moved out of `island.tsx`.
  - `live-activity.tsx`: `pointerInside` prop (stands in for hover; leaving an open card closes it after 0.9 s) and `data-island-shape`.
  - `island.tsx` steps aside while floating. `desktop-native.tsx` runs the island commands and follows the floating state.
  - `app/(desktop)/island/page.tsx`. `app/(capture)` was renamed to `app/(desktop)`.
  - Settings → Desktop: the Island card.
- **Docs:** SPEC T77 ticked, V70 amended. README and CHANGELOG updated.

## Verification (actual results)
- tripwire clean. `typecheck` and `desktop:typecheck` clean. Tests: 162 files, 1633 passed. ESLint: 0 errors; 2 `<img>` warnings, the same pattern as `NowPlayingArt`.
- **Preview** (demo, built stage). I used the real cursor and real clicks, and sent a click only after the island window confirmed hover. The cursor was put back afterwards.
  - The snapshot carried the 4 demo alerts.
  - With the main window unfocused, the island floated at the top centre over the owner's apps, transparent around the pill (screen grab, deleted after). The page island was hidden meanwhile.
  - A pill click opened the card.
  - Dismiss marked the alert read and it left the snapshot.
  - Moving the cursor away closed the card within 1.6 s.
  - Open brought the main window forward on `/money/subscriptions`; the floating island hid and the page island came back.
  - **Window states:** focused → hidden; minimised → shown; setting off → hidden; closed to the tray (`WM_CLOSE`) → shown; back in front → hidden.
  - A main window destroyed and made again (tray) got its island back (bug found and fixed here, see below).

## Review (wanheda-87): FIX ×2, then fixed
- **FIX 1** (gated mode): the island window loaded while signed out sat on `/login` for good, so it never reported content. Fixed: `needsLoad(current, origin, path)` (pure, it replaces `captureNeedsLoad`). When the main window's signed-in shell says commands-ready, `reloadHelpers()` loads `/capture` and `/island` again wherever they were sent elsewhere.
  - Preview: both helper windows sent to `/login`, then the main page reloaded → both back on their pages.
- **FIX 2** (zoom): Chromium shares zoom across same-origin windows, so zooming the main window grew the island past its window and off its hit rect. Fixed: `setZoomMode("isolated")` on the island and capture windows.
  - Preview: the main window zoomed with real Ctrl+Shift+= (devicePixelRatio 1.31) left the island and capture at 1. With the main window minimised, hover was true at the pill's centre and false 12 px beside it. The zoom was reset to 100 %.
- After the fixes: tests 162 files / 1633 passed; both typechecks and tripwire clean; ESLint 0 errors.

## Decisions made
- **Timers** go through the shared activity store (`localStorage` plus the `storage` event), as a second tab would, not through the snapshot. The island window reuses the timer views and buttons as they are (V70 amended).
- **The snapshot has no `musicHeld` filter:** the now-playing bar isn't on screen while the island floats.
- **No two islands:** the page's own island steps aside whenever the floating one is up. This covers the main window being visible but unfocused.
- **Hit rect:** the island shape plus 6 px, measured 10 times a second while there's content, and sent only on change.
- **Video isn't in the island**, same as the page island (music, speech, timers, transfers and alerts only).

## Bugs found (fixed in this diff)
- After the main window was really destroyed and made again (tray, link), there was no island window, because it was only created in `start()`. Fixed: `createWindow` makes it again once the server is up.

## Known problems and risks
- **A page calling `window.close()`** closes an Electron window outright, skipping the hide-on-close `close` event. Nothing in Wanheda calls it. The X button and Alt+F4 send `WM_CLOSE`, which hides as designed. This was found by my own test.
- **Not checked:**
  - music and read-aloud cards in the floating island (demo has no music folder, and read-aloud needs a voice download on the metered link); their commands are unit-tested through the parsers and `runIslandCommand`;
  - transfers;
  - an island over a full-screen app (T74 measured that it works);
  - more than one display.
- **Still open:** T44 (Phase 4 exit), 7c (unplugged drive), the owner's "Wanheda Desktop" GitHub OAuth app.

## Next steps (in order)
1. Merge the T77 PR once CI is green (the owner's standing go-ahead for this run), then the Reviewer's push and main checks.
2. T78 (desktop files) on `phase-8/desktop-files`.

## Files to read first
- desktop/island.ts, desktop/main.ts (`createIslandWindow`, `updateIsland`, `trackIslandCursor`, island handlers), desktop/bridge.ts, desktop/preload.ts
- lib/island/snapshot.ts, components/island/island-mirror.tsx, components/island/floating-island.tsx, components/island/live-activity.tsx, components/shell/desktop-native.tsx

## Env / services touched
- No new env vars. No downloads beyond the page loads.

## Review state
- Branch / PR: `phase-8/desktop-island` / opened after LGTM.
- Checkpoint 1 (diff): FIX ×2 from wanheda-87 (island in gated mode, zoom), both fixed; re-review LGTM.

### Reviewer prompt (T77)

```text
You are the REVIEWER for Wanheda (D:\Vxrcel\wanheda). Use the diff-reviewer skill; read-only, one pass.
Review the uncommitted diff on phase-8/desktop-island (T77 floating island). Read docs/handoff/LATEST.md → 2026-11-09-phase-8-t77-desktop-island.md, SPEC T77, V20, V61, V67, V70, desktop/README.md.
Bugs and edge cases only; verdict LGTM / LGTM with nits / FIX, sent to the Builder (wanheda-7a).
Weigh hardest: island IPC sender checks and parsers, click-through and the cursor poll, show/hide rules across window states, snapshot publish and reset, island window lifecycle, the page island stepping aside.
```
