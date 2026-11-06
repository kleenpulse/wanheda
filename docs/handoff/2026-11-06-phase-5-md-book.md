# Hand-off — Phase 5: Markdown and text as a paged book (T49)

| | |
|---|---|
| Date | 2026-11-06 |
| Phase / checkpoint | Phase 5 CP4: T49 built, PR open |
| Branch | `phase-5/md-book` (off `main` at `ad1fb9a`, PR #33 merged) |
| HEAD | the one-page and zoom commit on top of `613ffb3` (T49) and `55a914d` (this hand-off) |
| Open PR | #34 (https://github.com/kleenpulse/wanheda/pull/34), not merged |
| Previous hand-off | docs/handoff/2026-11-06-phase-5-md-viewer.md |

## State in one paragraph

Markdown and text files now have Book / Scroll, remembered per document (text still opens in Scroll). The book is the PDF's page-flip book, now a shared wrapper (`components/reader/flip-book.tsx`). The text is laid out once, hidden, at the page's text width, cut into pages that never break a line, and each page shows copies of only its blocks. Both views read and move one place (`md:<heading>:<y‰>`), so scroll ↔ book, width and text size all keep it. pdf.js now gets its CMaps and standard fonts from this origin, and PDFs carry a page count.

## Done this session

- **T49** (SPEC §T row has the full build note). New: `lib/reader/md-book.ts` (+ test), `components/reader/flip-book.tsx`, `components/reader/md/{md-book,md-scroll,view}.tsx|ts`, `components/reader/pdf/pdf-data.ts` (generated). `md-reader.tsx` is now the shell; `pdf/book-view.tsx` is the PDF layer over the shared book.
- **V41 amended**: md `y` to hundredths of a ‰, rounded up. **V40, V42 amended** (CMaps/fonts; text book).
- **T47 polish**: CMaps + standard fonts same-origin; `pages` on patch schema, store, `setPages`, read on add and open, shown in the library and back bar.
- **Fixed on the way**: PDF book's next page curled in blank after each window rebuild (`held` counter in FlipBook).
- **Found in the browser and fixed**: a hook behind `||` crashed the book when the stage turned narrow; a remount (motion setting) jumped the book back to the page it was laid out on; pages appeared one frame after the stage (page-flip now built in a layout effect).
- **User asks after the PR (2026-11-06, recording 16:23)**, pushed to the same PR #34: a 1-page document (PDF or text) opens as a single, centred page with no spread toggle (the device preference is left alone); zoom keeps the middle of the view in the middle, so from 100% the page zooms in centred (book and scroll view); a zoomed book pans by mouse drag or touch, and page-flip gets no press, move or hover while zoomed (no corner fold, no turn by drag; arrows, keys and the page field still turn); switching spread ↔ one page while zoomed opens the new book centred.
- **Settings → Reader** (user 2026-11-06, same PR): `components/settings/reader-prefs.tsx` + `components/reader/prefs.ts`. Library covers (page one or title card; page one fill or whole, with a live preview of the library's covers), book pages, page turn (curl or instant), text size, paper (`PaperPicker`), auto-scroll speed (`AutoScrollSpeed`). All device prefs, the same ones the reader's bars set. Reviewer LGTM with a nit (picker ids per instance), taken.
- **One-page fix** (Reviewer FIX on the recording commit): text one-page is decided only at the spread's page and latched per room, text size, text and content; the old version could loop between 1 spread page and 2 single pages.
- **Reviewer peer**: FIX (block lines re-read at every break, O(pages × lines) for a one-paragraph text file), fixed (read once, binary search) → LGTM.

## Things the next session must know

- **Pagination model**: `paginate(blocks, linesOf, height, total)` gets top-level blocks (headings marked `keep`) and reads a block's lines only when a break falls in it, once per call. Page = `[start, end)` in flow y; the next page starts at the break inside a block, or at the next block's top after a gap.
- **Page fill**: `fillPage` deep-clones the page's blocks, strips ids, builds a flow→copy text-node map (for find's highlights), measures the first copy's offset on a hidden "bench" (outside the MutationObserver's subtree, so filling never triggers a re-layout), then moves it into the page's window. Pages in spread ± 1 are filled when page-flip makes them.
- **Place rules**: a turn sets the place to the top of the open spread; a jump, switch or re-layout keeps it. `atPage` state is set with every layout and every turn; FlipBook's `startPage` reads it, so any remount opens on the right page.
- **Images**: the hidden flow sets every `img` to eager (it must measure them), so the book fetches all remote images of a Markdown file at once. The Reviewer flagged it for the user; it is in the PR body.
- **Big text**: the first switch to the book blocks once: ~0.7–1 s for 1 MB, ~3 s at the 5 MB cap.
- **pdf-data.ts** is generated from `node_modules/pdfjs-dist/{cmaps,standard_fonts}`. On a pdf.js upgrade the bundle test fails until it is regenerated (one literal `new URL` per file).
- Synthetic `keydown` dispatched on `window` throws in both readers' key handlers (`t.closest` on a non-element). Real keys target the body; harmless, but don't test keys that way.
- **Zoom internals** (`flip-book.tsx`): the view's middle is kept as fractions of the scrolled box (read on scroll, at mount and after each zoom) and restored in a layout effect on zoom change. Pan blocks `mousedown|mousemove|touchstart|touchmove|pointerup` in the capture phase on the scroller, which keeps page-flip's own listeners (and the reduced-motion swipe) from ever seeing them. The scroll view (`scroll-view.tsx`) only centres; dragging there still selects text.
- Demo files live only in the tab: device emulation (mobile) reloads the page and loses them.

## Verification (actual results)

- `bun run typecheck` clean; `bun run test` 89 files / 955; `bun run tripwire` clean; ESLint clean on every touched reader file; forged-commit check on `main..HEAD` clean. gitleaks not installed locally (CI scans).
- Zero-env production build on 3043 (the user's dev server holds 3000). Full list in the PR test plan; highlights: scroll → book → scroll 8319 → 8319 px; text size 134 → 164 → 207 → 134 pages with the place on the open spread; 820 px and 390 px keep the place; find, contents, `#links`, footnotes turn correctly; reduced motion 0 curl frames; hop ~100 ms with text in the first frame; 1 MB one-paragraph text → 2,603 pages in 1,024 ms; CMap PDF draws Japanese and Greek from `/_next/static/media` only; 0 console errors.

## Next steps

1. The user merges PR #34.
2. Owner run: a real Markdown file in the book on this device, then resume on a second device; a real CJK PDF.
3. User decision pending: whether the book should load remote Markdown images lazily (fixed-size placeholders, page breaks less exact around images).
4. Next checkpoint: **T50**, sentence extraction with locators (pdf text layer, md blocks) in a worker → `text.json` on the device (R2 later), versioned extractor (V44).
5. T44 still waits for the first real Polar sale.

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04,
tightened 2026-11-05): build features; tests only where they guard real logic or a spec exit
case; keep tripwire, forged-commit check and CI; one typecheck + test run before a commit;
after the Reviewer peer's LGTM (or LGTM with nits) commit, push and open the PR without asking;
merge and db:migrate stay the user's. A short hand-off + continuation prompt after every PR.
No worktrees. One checkpoint per session. House goal (CLAUDE.md): native-app feel, V24.

Start from docs/handoff/LATEST.md and docs/handoff/2026-11-06-phase-5-md-book.md, then
verify against the repo (git, tripwire, typecheck, tests). Check PR #34 (T49) is merged
(git log main) and check its incoming commits for forgeries before pulling. Branch
phase-5/<slug> off main for T50 per SPEC §T: sentence extraction with locators (pdf text
layer content, md blocks) in a worker, kept on the device as text.json until R2, versioned
extractor (V44); reuse the V41 locators (pdf:<page>:<y‰>, md:<heading>:<y‰> to hundredths).
Install only pinned versions (7-day cooldown; no bunx of unpinned tools).
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only. One pass, bugs and edge cases only, verdict LGTM / LGTM with nits / FIX, sent to the
Builder. Your LGTM is not the user's approval.
Target: the T50 diff. Riskiest: locators produced by extraction matching the readers' own
(V41), worker memory on a 14,000-page PDF and a 5 MB text, the extractor version invalidating
old text.json, hostile file content (V40). Context: docs/handoff/2026-11-06-phase-5-md-book.md.
```
