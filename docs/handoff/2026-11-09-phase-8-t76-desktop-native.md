# Hand-off — Phase 8: Desktop — T76 desktop native

| | |
|---|---|
| Date | 2026-11-09 |
| Phase / checkpoint | P8 CP3: T76 desktop native built and checked in preview; T76 ticked |
| Branch | `phase-8/desktop-native` (off `main` at `63ce939`), Reviewer LGTM, committed for a PR |
| HEAD at start | `63ce939` — Merge pull request #80 from kleenpulse/phase-8/desktop-shell |
| Previous hand-off | docs/handoff/2026-11-08-phase-8-t75-desktop-shell.md |

## State in one paragraph
T75 merged as PR #80 (`63ce939`) after wanheda-87's FIX, re-review, push check and main check. The owner said before sleeping: on the Reviewer's LGTM, commit, push, open the PR, merge, then the next task. T76 is built. The desktop shell now has:
- quick capture (Ctrl+Shift+Space, a `/capture` window over any app);
- the palette shortcut (Alt+Space);
- media keys held only while Wanheda has an audible owner;
- Windows notifications for new timer, money and income notices while the window is in the background;
- Settings → Desktop (keep running, change or turn off shortcuts, re-import or demo mode).

Reviewer wanheda-87: FIX (quick capture around sign-in) fixed, then LGTM.

## Done this session
- **T75 close-out:**
  - FIX: subframe `will-redirect` could open the system browser. Fixed via `navigationStep`, plus 3 nits.
  - LGTM, then PR #80 merged with CI green. The push check and main check passed.
- **Desktop:**
  - `shortcuts.ts` (new): accelerator parser, defaults, media keys, `parseShortcuts`.
  - `bridge.ts`: 8 new channels plus parsers (`parseNotice`, `parseCaptureText`, `parseDesktopChange`, `parseAudible`, `parseSecretsAction`) and types.
  - `preload.ts`: the full `window.wanheda` surface.
  - `settings.ts`: `shortcuts`.
  - `main.ts`:
    - `fromWindow` sender check on every handler;
    - notices;
    - `applyShortcuts` / `holdMediaKeys`;
    - capture window;
    - `desktopState` / `pushState`;
    - media keys released on a main-window navigation or a lost renderer;
    - shortcuts unregistered on quit.
- **Web:**
  - `lib/media/session-owner.ts`: `subscribe()` and `command()`.
  - `lib/platform/desktop.ts`: types, `desktopNotice`, `acceleratorFromKey`, `acceleratorKeys`, `isDesktopCommand`.
  - `components/shell/desktop-native.tsx`: notices, media, commands, mounted in the shell frame.
  - `app/(capture)/capture/page.tsx` and `components/notes/quick-capture.tsx`.
  - `components/settings/desktop-section.tsx`. The settings board shows Desktop only in the app.
- **Docs:**
  - SPEC: T76 ticked with a summary, V71 amended.
  - `desktop/README.md` has a Native features section.
  - CHANGELOG has 4 entries.

## Verification (actual results)
- tripwire clean. `typecheck` and `desktop:typecheck` clean. Tests: 160 files, 1614 passed (1616 after the review fixes).
- ESLint on changed files shows 0 problems. Three errors remain in files this branch doesn't touch (`components/settings/voice-manager.ts`, `voices-section.tsx`).
- **Preview** (built stage, demo; CDP plus real system-wide key events from `keybd_event`, sent only for hotkeys Wanheda held):
  - **Settings → Desktop:**
    - it renders;
    - recording Ctrl+Alt+N for Quick note works;
    - the same keys for the palette are refused with "Quick note already uses those keys.";
    - Turn off, Turn on and Reset all work, and `settings.json` is right;
    - the keep-running switch flips both ways;
    - "Import .env file…" with the picker cancelled returns demo state.
  - **Quick capture:**
    - Ctrl+Shift+Space shows it focused, with the text field active;
    - Enter saves, clears and hides it, and the note shows in Notes;
    - Esc hides it.
    - Demo notes live in memory, so a reload loses them, as designed.
  - **Palette:** Alt+Space focuses the window with the palette open.
  - **Timer notice:** a 10 s timer, with the window unfocused by quick capture, logged `notice: timer`.
  - **Media keys:**
    - while the Sintel trailer played, the play-pause key logged `media key: play-pause` and paused it; a second press played it again;
    - a reload logged "released", then "held" for the new page's owner;
    - a client navigation to Notes logged "released".
  - **Sender checks:** the capture window calling `settings.get()` and the main window calling `capture.save()` were both refused ("Not allowed.").
  - The logs hold no note text. The preview `secrets.json` was deleted afterwards.

## Review (wanheda-87): FIX, then fixed
- **FIX** (quick capture in gated mode): fixed.
  - The capture window reloads `/capture` whenever it isn't on it (`captureNeedsLoad`). A capture window that lands on another page while shown hides, and the main window comes forward for sign-in.
  - Saving now means a listener took it. `DesktopNative` sends `commands-ready` (true on mount, false on unmount). Main resets it on every main-window navigation, a lost renderer and close, and `sendCommand` uses `canTakeCommand`. Quick capture keeps the text and says "Open Wanheda and sign in, then press Enter again."
- **Nit 1:** a notice path main may not open becomes null; the notice still shows.
- **Nit 2:** Settings → Desktop calls catch a refused call or a reload in the middle of a call.
- **Nit 3:** the recording hint says keys Wanheda already uses do their own thing.
- **Preview after the fixes:**
  - With the main window on `/login`, Enter in quick capture kept the text and showed the line. Back in the shell, Enter saved it into Notes.
  - The capture window sent to `/login` while shown hid itself and focused the main window. The next Ctrl+Shift+Space showed `/capture` again, focused.
  - Tests: 160 files / 1616 passed. Both typechecks, tripwire and ESLint (changed files) are clean.

## Decisions made
- **The island toggle moves to T77:** there's no island yet, and a switch that does nothing is worse than none (SPEC T76 says so).
- **Quick capture has no data of its own:** the text goes to main, then to the main window's page, which calls `notesApi.capture`. So there's one notes runtime and one outbox.
- **Notifications show only when the window is out of sight or unfocused.** Rows the shell loaded with count as history. Rows that come in later (timer raise, money/income merge) get notified once.
- **A paused owner still holds the media keys**, so play works. They're released when the claim goes or on a full navigation.
- **Shortcut defaults:** Ctrl+Shift+Space and Alt+Space. Modifiers are always written Ctrl, Alt, Shift, Super; Shift alone isn't allowed.

## Known problems and risks
- **Not checked:**
  - a notification's click (Windows toast UI);
  - money/income notices, which reach the client only after a save or a shell load;
  - the media keys `next`, `previous` and `stop`. They are unit-tested through `mediaSession.command`, but I didn't press them, to avoid loading another video on the metered link.
- **Alt+Space** replaces Windows' window menu shortcut while Wanheda runs. The owner can change it in Settings → Desktop.
- **Still open:** T44 (Phase 4 exit), 7c (unplugged drive), and the owner's "Wanheda Desktop" GitHub OAuth app.

## Next steps (in order)
1. Merge the T76 PR once CI is green (the owner's standing go-ahead for this run), then the Reviewer's push and main checks.
2. T77 (desktop island) on `phase-8/desktop-island`.

## Files to read first
- desktop/bridge.ts, desktop/shortcuts.ts, desktop/main.ts (`fromWindow`, `showNotice`, `applyShortcuts`, `holdMediaKeys`, `createCaptureWindow`), desktop/preload.ts
- components/shell/desktop-native.tsx, components/notes/quick-capture.tsx, components/settings/desktop-section.tsx, lib/media/session-owner.ts

## Env / services touched
- No new env vars. Network: the Sintel trailer (a few MB) and the YouTube embed page during the checks.

## Review state
- Branch / PR: `phase-8/desktop-native` / opened after LGTM.
- Checkpoint 1 (diff): FIX from wanheda-87 (quick capture around sign-in), fixed with its 3 nits; re-review LGTM.

### Reviewer prompt (T76)

```text
You are the REVIEWER for Wanheda (D:\Vxrcel\wanheda). Use the diff-reviewer skill; read-only, one pass.
Review the uncommitted diff on phase-8/desktop-native (T76 desktop native). Read docs/handoff/LATEST.md → 2026-11-09-phase-8-t76-desktop-native.md, SPEC T76, V60, V67, V71, desktop/README.md.
Bugs and edge cases only; verdict LGTM / LGTM with nits / FIX, sent to the Builder (wanheda-7a).
Weigh hardest: IPC sender checks per window, payload parsers, preload surface, capture window lifecycle, global shortcut and media-key registration, notices, Settings → Desktop.
```
