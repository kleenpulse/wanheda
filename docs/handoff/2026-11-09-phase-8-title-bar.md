# Hand-off — Phase 8: Desktop — title bar like VS Code, island grey box fixed

| | |
|---|---|
| Date | 2026-11-09 |
| Phase / checkpoint | P8, owner requests between T79 and T80: a themed title bar in the main window; the floating island's grey box |
| Branch | `phase-8/desktop-titlebar` (off `main` at `5cd7926`), uncommitted, waiting for review |
| HEAD at start | `5cd7926` — Merge pull request #85 from kleenpulse/phase-8/desktop-browser-sign-in |
| Previous hand-off | docs/handoff/2026-11-09-phase-8-browser-sign-in.md |

## State in one paragraph
PR #85 (GitHub sign-in in the browser) merged as `5cd7926`. The owner tested a real sign-in on the installed build, and wanheda-87's main check passed.

The owner then asked for two things:
- **A title bar matching the app's theme, the way VS Code does it.** The main window now has no Windows title bar. Windows draws only its caption buttons, and the page draws the rest of the strip in the skin's background. That strip has a ☰ button (the app menu), the mark and the name, and it sends its colours to main so the buttons match.
- **Why a grey box sat around the floating island.** It was Nebula's vignette. `.dark body::before` is a fixed inset 220 px shadow, and the island's small transparent window loaded it too, so the whole 420×360 window came out about 30 % grey over other apps. It has been there since T77; a preview built from plain `main` showed it as well, in the owner's second recording. The island page now drops it.

## Done this session
- **Main** (`desktop/main.ts`):
  - The main window uses `titleBarStyle: "hidden"` and `titleBarOverlay` (32 DIP; colours from the page once it has sent them, the splash colours until then).
  - IPC `title-bar-colors` calls `setTitleBarOverlay`. IPC `title-bar-menu` pops the app menu at the button, converting CSS px × zoom to DIP. Both handlers take the main window only.
  - The splash has a drag strip.
  - View menu keys are handled in `before-input-event` (`menu-keys.ts`).
- **Bridge:**
  - `bridge.ts`: the 2 channels, plus `parseTitleBarColors` (`#rrggbb` ×2) and `parseMenuAnchor` (finite numbers, 0–16384, rounded), with tests.
  - `preload.ts` exposes `window.wanheda.titleBar`, and `lib/platform/desktop.ts` has its type.
- **Keys** (`desktop/menu-keys.ts`, pure, + test):
  - Ctrl+= / Ctrl+NumpadAdd / Ctrl+- / Ctrl+0 zoom; Ctrl+R / Ctrl+Shift+R reload; F11 full screen; Ctrl+Shift+I dev tools, unpackaged only.
  - The hidden menu bar doesn't run its accelerators, so main runs these. `preventDefault` makes sure nothing fires twice.
- **Page:**
  - `components/shell/title-bar.tsx`, mounted in the root layout. It is fixed, `h-(--tb)`, `bg-background`, an `app-region: drag` strip. Its contents render only while `navigator.windowControlsOverlay.visible`, which it follows through `geometrychange` (full screen hides them).
  - Colours go through a 1-pixel canvas to get `#rrggbb`. A MutationObserver on `<html>` attributes re-sends them when the theme, skin or accent changes.
- **CSS:**
  - `app/globals.css`: `--tb: env(titlebar-area-height, 0px)` and `--app-h: calc(100svh - var(--tb))`, with `body { padding-top: var(--tb) }`.
  - Every full-height or top-pinned piece moved to `--app-h` / `top-(--tb)`: the shell frame, the rail, the shell's loading rail, page-fill frames, the island, the notification centre, the wallpaper, the window layer, reader full mode, the reader stage, watch view's fill stage, the money bottom sheet, grow-dialog (container, max height, grow centre) and the wallpaper's scene boxes. On the web `--tb` is 0, so nothing changes.
- **Island:** `app/(desktop)/island/page.tsx` adds `body::before{content:none!important}`.
- **Docs:** SPEC V67 amended, V70 fixed. The desktop README gets a "Title bar" bullet. The CHANGELOG's unreleased desktop sentence was updated (the island fix needs no entry, since it isn't released).

## Verification (actual results)
- tripwire clean. `typecheck` and `desktop:typecheck` clean. Tests: 168 files, 1680 passed. ESLint on the changed files: 0.
- **Preview, dark:**
  - `--tb` = 32px, `windowControlsOverlay.visible` true, its rect 1143×32.
  - The bar's background is rgb(5,10,11), the ☰ button is present, and the body padding is 32px.
  - Window capture (`PrintWindow`): the bar is continuous with the rail, the caption buttons are themed, and the rail and scrollbar start below the bar.
- **Preview, light:** the bar takes Ember's paper colour, and the caption buttons switch to dark symbols.
- **☰ menu:** File / Edit / View / Window open right under the button.
- **Island:**
  - Brightness just inside the island's left edge against just outside: 0.71 with the vignette, 1.04 without it. With the page at opacity 0 it was 0.97, so the page drew the box.
  - The owner's two recordings showed the box both on the title bar build and on plain `main`.
- **Not checked:** real keys (Ctrl+= etc.). DevTools-injected key events don't pass through `before-input-event`, so this needs the owner or a real keyboard.

## Review (wanheda-87): LGTM with nits, both taken
- **Nit 1:** `components/ui/grow-dialog.tsx` was the one missed site, used by 7 dialogs: the money forms, goals and reader edit. Its container is now `top-(--tb) bottom-0`, the panel's `max-h` is `calc(var(--app-h)-2rem)`, and the grow animation's centre is `(innerHeight + --tb) / 2`. Without this, a full-height form would sit 16 px under the bar.
- **Nit 2:** the wallpaper's two scene boxes are `h-(--app-h)`, so the fade ends at the window's bottom.
- Still to check (the owner, real app): Ctrl+= ×3. The bar should still meet the caption buttons' height, and ☰ should open under the button. That relies on Chromium dividing `titlebar-area` env() by the zoom.

## Decisions made
- **The page draws the bar, Windows draws the buttons** (Window Controls Overlay), the way VS Code works on Windows. The height comes from CSS `env()`, so no JS runs before first paint, and nothing changes on the web or in the helper windows.
- **The ☰ button replaces the hidden menu bar.** There's no full VS Code-style menu row; the four menus fit in one popup.
- **View keys in main, not the hidden menu.** They are reliable whether or not Electron's hidden-menu accelerators fire.

## Known problems and risks
- Fixed dialogs' backdrops (z-50) sit under the bar (z-70), so the bar stays visible and draggable while a dialog is open. VS Code does the same.
- The bar uses `bg-background`, a flat colour. Nebula's top glow starts below it.

## Next steps (in order)
1. The owner checks real keys in the preview: Ctrl+=, Ctrl+-, Ctrl+0, Ctrl+R, F11.
2. Reviewer wanheda-87 reviews. On LGTM: commit (the island fix as its own commit), push, PR. Merging is the owner's call.
3. T80 still waits for the owner's yes (ffmpeg ≈ 126 MB).

## Files to read first
- components/shell/title-bar.tsx, app/globals.css (`--tb`, `--app-h`), desktop/main.ts (createWindow, `titleBarOverlay`, `runMenuKey`, the two IPC handlers), desktop/menu-keys.ts, desktop/bridge.ts (parsers), app/(desktop)/island/page.tsx

## Env / services touched
- No env vars. No downloads.

### Reviewer prompt

```text
You are the REVIEWER for Wanheda (D:\Vxrcel\wanheda). Use the diff-reviewer skill; read-only, one pass.
Review the uncommitted diff on phase-8/desktop-titlebar (themed title bar like VS Code + the island's grey box). Read docs/handoff/2026-11-09-phase-8-title-bar.md, SPEC V67 (amended) and V70 (fixed), desktop/README.md "Title bar".
Bugs and edge cases only; verdict LGTM / LGTM with nits / FIX, sent to the Builder.
Weigh hardest: the two new IPC channels (sender check, parsers), menu-keys preventing double fires, every 100svh/top-0 site moved to --app-h/--tb (any missed?), web unchanged when --tb = 0, full screen, the island fix.
```
