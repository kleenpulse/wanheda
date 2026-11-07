# Hand-off: music list fills the page height

| | |
|---|---|
| Date | 2026-11-07 |
| Phase / checkpoint | UI fix between Phase 7 checkpoints, `fix/music-list-height` |
| Branch | `fix/music-list-height` (off `main` at `5523fb7`) |
| HEAD | `5523fb7`, Merge pull request #50 (the work is uncommitted on top) |
| Previous hand-off | docs/handoff/2026-11-07-pdf-password.md |

## State in one paragraph

T67 (password-protected PDFs) is merged as PR #50 (`5523fb7`). The Reviewer's post-merge check came back VERIFIED.

This branch fixes the double scrollbar on Media → Music. The user asked for it through `wanheda-c2`, and c2's diagnosis and plan were followed. The music list now takes the height left under its tabs and scrolls by itself, so the page never scrolls on that tab. Next is T64 `phase-7/music-player`.

## Done

- **`components/shell/page-frame.tsx`:** a page can opt in to filling the screen by marking an element `data-page-fill`. It works through CSS `has()`, so the client-side Music tab opts in without the server page knowing.
  - The frame becomes `h-svh`.
  - The sheet becomes a column with `min-h-0`.
  - The inner column becomes `flex-1 min-h-0` with `pb-0`; the dock clearance moves into the scroller.
  - Every other page is unchanged.
- **`media-app.tsx` and `music-view.tsx`:** the roots are `min-h-0 flex-1`, and MusicView carries `data-page-fill`.
- **Both VirtualLists:** `max-h-[min(70vh,48rem)]` became `min-h-40 flex-1 pb-[calc(76px+2rem)]`.
  - The list runs to the sheet's bottom edge, under the dock, and its last row clears the dock.
  - The 160 px floor means a very short window scrolls the page rather than hide the list.
  - VirtualList already re-measures on resize (ResizeObserver).
- **A floor for very short screens** (the Reviewer's nit): the filled frame also gets `min-h-[34rem]`. Below 544 px of height (a phone on its side) the frame stops shrinking and the page scrolls with the sheet behind the list, so the list never hangs below the sheet's background. Dropping the sheet's `min-h-0` instead was rejected: a scroll container's content height could then hold the sheet open at every size.
- **The dev overlay's "1 Issue":** Chrome's "form field should have an id or name" notice. The three hidden file inputs in Media now have names: `subtitles`, `music-folder` and `media-file`.
- **CHANGELOG:** an Unreleased → Fixed line.

## Verification (actual results)

- Tripwire clean, typecheck clean, 1241/1241 tests, eslint 0 errors (the old `cover.tsx` `<img>` warning remains). The production build passes (rebuilt after the floor, with the input names in).
- **Browser** (demo mode, production build on :3043, 300 untagged MP3s through the folder input):
  - **1250×976:** the page doesn't scroll (976 = 976). The list ends at 976. Scrolled to the end, Song 300's bottom is at 868 and the dock's top at 900. Mid-scan, the page doesn't scroll either.
  - **1250×600:** the page doesn't scroll; the list is 279 px.
  - **390×844 mobile:** the page doesn't scroll. The last row's bottom is at 736 and the tab bar's top at 768.
  - **The Videos tab still scrolls as a page** (704 > 600), with no `data-page-fill` in the DOM.
  - The console shows no errors or warnings.
  - **After the floor, on a fresh build:** at 1250×420 and at 844×390 (mobile, landscape) the page scrolls (544 > 420 or 390) and the list stays inside the sheet (297–544 ⊂ 100–544). At 1250×976 and 390×844 the page still doesn't scroll.

## Next steps (in order)

1. Reviewer pass (`wanheda-2a`).
2. On LGTM: commit, push, open the PR, tip check, merge.
3. T64 `phase-7/music-player`.

## Files to stage (by name)

`CHANGELOG.md`, `components/shell/page-frame.tsx`, `components/media/{media-app,music-view}.tsx`, `components/media/use-file-pick.tsx`, `docs/handoff/2026-11-07-music-list-height.md`, `docs/handoff/LATEST.md`.

## Env / services touched

- No database writes, no migrations.
- The demo server on :3043 is stopped.
- The 300-file fixture is in the scratchpad `many/`.
