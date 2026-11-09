# Hand-off — Inlay wordmark and ellum-style rail (owner request)

| | |
|---|---|
| Date | 2026-11-09 |
| Phase / checkpoint | P8 side request (no T number): Inlay wordmark in the expanded rail, then ellum-harness rail behaviour, then the dark active-item fill |
| Branch | `phase-8/inlay-wordmark` (off `main` at `bbb6d2d`), commit `b8a5035`, PR #89 opened on the owner's word (no Reviewer pass), waiting for the owner's merge |
| HEAD at start | `bbb6d2d` — Merge pull request #88 from kleenpulse/phase-8/account-deletion |
| Previous hand-off | docs/handoff/2026-11-09-phase-8-account-deletion.md |

## State in one paragraph

With the rail expanded, the name reads WANHEDA (26px, extrabold) and is drawn with Motion Garden's Inlay, molten material, in the skin's signal colour. The mark shrinks from 44 to 36px when the rail is open. The rail now behaves like ellum-harness's: clicking its right edge toggles it, and the Collapse row shows only while the pointer is over the rail. A view can hold the rail collapsed; theatre mode does. While the rail is held, a toggle shows a small anchored note ("The sidebar stays collapsed here") at the pointer, or at the Collapse row for `[`. The saved cookie is never changed by a hold. In dark skins the active rail item sits on `bg-band`, like the mark.

## Done this session

- `components/ui/inlay.tsx`: Inlay ported from shadow-garden's registry (ogl → raw WebGL2, molten only, colours as resolved token bytes). It halts when `paused` and re-pours on un-pause. A CSS gradient stand-in (`data-poured` drops it) stays until the first full pour. Reduced motion uses sweep 0.
- `hooks/use-wallpaper-palette.ts`: moved out of `components/prefs/wallpaper.tsx` unchanged, shared with the wordmark.
- `components/shell/nav-rail.tsx`: `Wordmark` (Inlay, `paused={!expanded}`, scale 0.7, glow 0.3, grain 0.08). A `group/rail` wrapper holds the sticky width; there is an edge button; the Collapse row is hover-revealed and carries `data-rail-toggle`; the mark is `size-9` when open.
- `components/shell/rail-lock.ts`: a zustand `useRailLock` and `useHoldRail(reason)`.
- `components/ui/anchored-note.tsx`: Base UI Toast manager `anchoredNote`, `notePoint(x, y)`, `AnchoredNotes` (glass, `z-[200]`, timeout 3.5 s). Mounted in `ShellFrame`.
- `components/shell/shell-frame.tsx`: `expanded` (choice, cookie) vs `shown` (`expanded && !lock`). `toggle(event?)` shows the note when held. `html[data-rail]`, `--rail-w`, `NavRail` and the palette all follow `shown`.
- `components/media/watch-view.tsx`: `useHoldRail(theatre && current ? "Leave theatre mode to expand it again." : null)`.
- `components/shell/styles.ts`: `activeFill` dark is now `bg-band` (was `signal-soft`).
- CHANGELOG: 3 entries under Added and 1 under Changed.

## Verification (actual results)

- typecheck clean, tripwire clean, Vitest 175 files / 1755 passed, ESLint: no new warnings on the changed files. The pre-commit gitleaks found no leaks; `forged-commits.sh origin/main..HEAD` is clean.
- Chrome, demo-mode standalone build on :3306 (the owner's dev server held :3000):
  - the edge toggles the rail, and the cookie persists;
  - the wordmark is 139px in a 143px slot;
  - the Collapse row has opacity 0 until hover;
  - theatre holds the rail at 84px while the cookie says open;
  - the note appears at the pointer for a click, and at the Collapse row's y for `[`;
  - leaving the watch view restores 232px.
- **Not checked in a browser:** the final `bg-band` active fill, and the Ember light skin with the wordmark.

## In progress / not finished

- **shadow-garden** (`D:\Vxrcel\shadow-garden`, on `main`): the registry Inlay's reduced-motion fix is uncommitted (`components/registry/inlay/inlay.tsx`, +8/−4; its typecheck is clean). That checkout has 5 other uncommitted files that are not ours (`Sidebar.tsx`, `Wordmark.tsx`, `globals.css`, `layout.tsx`, `detail-client.tsx`). Stage only the Inlay file. PRO-shadow-garden is sunset.

## Decisions made

- **No `ogl`.** The wallpapers already use raw WebGL, and the link is metered.
- **Theatre mode is the only view that holds the rail.** Wanheda had no forced-closed state, so it was the natural one. It's one `useHoldRail` line per view.
- **The note uses the menus' `glass` surface at `z-[200]`.** `card-nested` is a 4.5% tint in Nebula and couldn't be read over video.
- **Ellum's `useSyncExternalStore` + `rail-open:` variant store was not ported.** Wanheda's cookie + boot script already paints the right width on load.

## Known problems and risks

- In Nebula, `--band` is transparent, so the active pill shows the capsule's tint while the mark sits on the page directly. It is close but not exact.
- The mobile tab bar's active item still uses `signal-soft`. The owner hasn't decided whether it should match.
- The wordmark holds one WebGL2 context for the life of the shell (it is halted while collapsed).

## Next steps (in order)

1. Owner merges PR #89 → after-merge check (incoming commits, forged-commits, tree matches `b8a5035` + this hand-off), `git tidy`.
2. Optional: commit the shadow-garden Inlay fix (only that file).
3. Back to the Phase 8 queue: T80 (desktop media, ffmpeg ≈ 126 MB, needs the owner's yes first).
