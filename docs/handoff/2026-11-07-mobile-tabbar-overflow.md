# Hand-off: phone tab bar overflow menu

| | |
|---|---|
| Date | 2026-11-07 |
| Phase / checkpoint | UI fix between Phase 7 checkpoints, `fix/mobile-tabbar-overflow` |
| Branch | `fix/mobile-tabbar-overflow` (off `main` at `30390a9`) |
| HEAD | `30390a9`, Merge pull request #51 (the work is uncommitted on top) |
| Previous hand-off | docs/handoff/2026-11-07-music-list-height.md |

## State in one paragraph

`fix/music-list-height` is merged as PR #51 (`30390a9`). The Reviewer's post-merge check came back VERIFIED.

The user then asked directly, with a screenshot of the phone tab bar clipping its last button: "add a dynamic popover dropdown if mobile menus are overflowing optimised for mobile touch". That is built and checked in the browser. Next is T64 `phase-7/music-player`.

## Done

- **`lib/shell/tab-overflow.ts`** (pure, 6 tests):
  - `tabCapacity(width)` gives whole 48 px slots (a 44 px circle plus 4 px).
  - `splitTabs(routes, capacity, pinned, active)`:
    - When everything fits, there is no More.
    - Otherwise More takes a slot and at least one route stays.
    - An overflowing active route takes the bar's last route place.
- **`components/shell/mobile-tab-bar.tsx`:**
  - The bar's width is measured with a `ResizeObserver` in a layout effect, so the trim happens before paint; until then the server's full HTML shows.
  - Search and the account menu stay pinned.
  - The overflow opens from a "More apps, N" button (Ellipsis icon) in a Base UI menu above the bar: rows 48 px tall, 15 px labels, 20 px icons.
  - Touch feedback: `active:scale-95` on the bar's circles.
- **Detour fix in `components/ui/menu.tsx`:** `MenuLinkItem` now defaults to `closeOnClick`. Base UI leaves a link's menu open, expecting the page to unmount it; the shell's menus outlive navigation. Found in the browser: tapping Reader in More navigated, but the menu stayed open. The account menu's Settings link had the same bug.
- **CHANGELOG:** two Unreleased → Fixed lines.

## Verification (actual results)

- Tripwire clean, typecheck clean, 1247/1247 tests, eslint clean on the touched files, production build passes.
- **Browser** (demo mode, production build on :3043, mobile emulation):

| Width | Bar | More menu | Clipped |
|---|---|---|---|
| 390 px, on /media | Home, Money, Income, Media (current), More | Notes, Reader, Settings; rows 48 px tall | 0 |
| 360 px, on /reader | Home, Money, Reader (current), More | 4 apps | 0 |
| 700 px | All 7 apps | No More button | 0 |

  - Search and Account are pinned at the end in every case.
  - Tapping Notes in More: the page goes to /notes, the menu closes, and Notes takes the bar slot.
  - The account menu's Settings link closes its menu too.
  - No console errors.

## Next steps (in order)

1. Reviewer pass (`wanheda-2a`).
2. On LGTM: commit, push, open the PR, tip check, merge.
3. T64 `phase-7/music-player`.

## Files to stage (by name)

`CHANGELOG.md`, `lib/shell/{tab-overflow,tab-overflow.test}.ts`, `components/shell/mobile-tab-bar.tsx`, `components/ui/menu.tsx`, `docs/handoff/2026-11-07-mobile-tabbar-overflow.md`, `docs/handoff/LATEST.md`.
