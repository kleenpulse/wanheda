# Hand-off — Phase 5: PDF reader as a book (T47)

| | |
|---|---|
| Date | 2026-11-06 |
| Phase / checkpoint | Phase 5 CP2: T47 built, PR open |
| Branch | `phase-5/pdf-viewer` |
| HEAD | `7b124a8025af3c379d6ce57755b2d4bac7bddf6e` — feat: Phase 5 PDF reader as a book (T47); this hand-off follows it |
| Open PR | #31 (https://github.com/kleenpulse/wanheda/pull/31), not merged |
| Previous hand-off | docs/handoff/2026-11-06-phase-5-book-decision.md |

## State in one paragraph

PDFs open in Wanheda's own reader instead of the browser's viewer. The default is a book: page 1 alone as the cover, then two-page spreads with a real page curl (`page-flip` 2.0.7, wrapped by hand), a spine shade, page-edge stacks, full-height edge arrows, find above the book, and a bottom bar with zoom, an all-pages grid, first / previous / an editable `a-b / N` field / next / last, a spread or one-page toggle, and full screen. One tap switches to a scroll view (virtual pages, selectable text, find marks, contents). Both views share one place (`pdf:<page>:<y‰>`), so switching and reopening keep the page. New PDFs open as books; a PDF's page 1 becomes its library cover. Library titles stay on one row, and a title that doesn't fit slides by once every 5 s.

## Done this session

- **T47** (SPEC §T): see its row for the full build note. V40 and V42 amended (below).
- Supply chain, read before installing: `page-flip` 2.0.7 (0 deps, no install hooks, published 2021-04-18); `react-pdf` 11.0.0 and `pdfjs-dist` 6.3.289 (both published with npm provenance from GitHub Actions). `pdfjs-dist` brings optional `@napi-rs/canvas` 1.1.0 (Node only, never in the browser bundle). All pinned exactly.
- Decided by the user during the session (via the Reviewer and directly):
  - Search box above the book too, using the same find as the scroll view; a hit turns to its spread. No page number in the URL.
  - A one-page book on wide screens as well, because small print is unreadable in a spread. On a wide screen it fits the page to the width (≤ 900 px) and the stage scrolls. The choice is per device, for every PDF (localStorage `wanheda-reader-book-pages`); `document.mode` stays `flip | scroll`.
  - Library card titles: one row; a title that overflows slides by (after Aventine's `MarqueeText`). Only an edge with text running past it fades. One linear pass at 45 px/s, then a 5 s rest.
  - Pin one document in the library (this device, localStorage `wanheda-reader-pin`): it leads the grid and its cover is the liquid tank from the billing-cycle card, filled to its percent. The tank now lives in `components/ui/liquid-tank.tsx`, shared by both.
  - Auto-scroll where the stage scrolls (scroll view, one-page book fitted to the width, a zoomed book): off on every open; a slider (0–100, this device) sets the speed on a square curve, 1–200 px/s, so its low end creeps (20 → 8 px/s); the book waits 1.2 s at the foot of a page, turns and goes on; it stops at the end, or as soon as the search field takes focus or a search runs, and pauses under the grid or the contents. The page field takes only digits and one hyphen as you type (`cleanPageField`); "142-" reads as 142.
  - Translucent bars floating over the stage (pages scroll under them; a fixed 56 px inset in both views, so showing or hiding never resizes the book). While auto-scroll runs, the controls fade after 2 s without pointer movement and come back on any move or tap (kept while the pointer is on a bar, or focus is inside). An eye button (and H) hides them; a small eye in the corner brings them back. On phones the zoom buttons are hidden and the speed slider floats above its button, so the bar fits 360 px.
  - Fixed from a recording: mid-turn page-flip swept the page far past the book's edges, so a horizontal scrollbar grew on every turn in one-page mode. The book's box is now `overflow: clip`; scroll range stays fixed through a turn.
  - Paper colour (`components/reader/pdf/paper.tsx`): a swatch menu in the top bar beside Book / Scroll, with the Notes sticky palette, 6 light (Ember values) and 6 dark (Nebula values). A light paper lays a multiply wash over the drawn page (white becomes the paper, ink stays). A dark one inverts the page image or canvas (hue kept), then screens the paper over it. Pure CSS, so nothing is redrawn; it covers book, scroll, page edges and thumbnails. Hover or arrow keys preview on the page; leaving or closing the menu restores the choice. The menu portals into the stage, so it shows in full screen. Dark papers turn colour illustrations into luminance negatives (the usual dark-PDF trade-off). The full-screen button is hidden under `sm` (no room, and iPhones can't full-screen an element). That also fixed the scroll-view bottom bar, which was 10 px wide of a 360 px phone.
  - The four device preferences (pin, spread/single, auto-scroll speed, paper) share `components/reader/device-pref.ts` (localStorage, cross-tab, in-memory fallback when writes are refused).
- Reviewer FIX, fixed: module caches (`lastLoaded`, the engine's held PDF, `lastRead`) could outlive their document. They now drop on delete (`components/reader/doc-cache.ts` → `forgetDoc`), on a failed open, and on a range read that fails (which used to hang pdf.js; it now shows "can't be opened"). Find nits fixed too: one lowercased string a page cached for search, matching by a Unicode case-insensitive pattern over the original text, runs joined the pdf.js way.

## Things the next session must know

- **pdf.js 6 has no `isEvalSupported`** (the option and the eval path are gone upstream). V40 now says so: `lib/reader/pdfjs-bundle.test.ts` fails if `pdf.min.mjs` or `pdf.worker.min.mjs` ever contains `Function(`, `eval(`, a string timer or `importScripts`.
- **page-flip has two traps.** (1) Its renderer restyles every page it holds on every animation frame, so the book only ever hands it a window of a few spreads (`lib/reader/book.ts`) and rebuilds it at the edges. (2) `Render.start()` runs a rAF loop that `destroy()` never stops, so there is one instance per mount and `neuter()` in `book-view.tsx` empties it on unmount.
- The worker and the `openjpeg` / `jbig2` wasm are bundler-emitted hashed assets (`new URL(..., import.meta.url)`), served by a custom `BinaryDataFactory` that serves nothing else. **CMaps and standard fonts are not served yet**: PDFs that rely on non-embedded fonts or CJK CMaps fall back to system fonts.
- react-pdf's `OutlineItem` logs an unhandled rejection when a PDF's outline points at something that isn't a page (seen with a malformed test PDF). Nothing breaks.
- The user's own dev server holds port 3000 (Next allows one dev server per folder), so browser checks ran on a zero-env production build on 3043. Restart theirs if it still shows old CSS.

## Verification (actual results)

- `bun run typecheck`: clean. `bun run test`: 87 files, 922 tests pass. `bun run tripwire`: clean. ESLint on every touched file: clean. Zero-env `bun run build`: OK.
- Browser (production build, demo mode, port 3043), with generated test PDFs of 9, 300 and 14,038 pages:
  - 300-page cold open: first canvas and text layer in 176 ms (V43 asks < 2 s).
  - 14,038 pages / 32 MB: page-flip held ≤ 10 pages, 6 live images, heap flat at 17 MB over 8 turns; a jump to page 7000 painted in 83 ms.
  - Library → document hop: no loading frame, painted in 34 ms (V24).
  - Curl: 33 frames over ≈ 0.54 s; a corner drag shows the next page on the back. The field reads the old spread mid-turn and updates on landing.
  - Reduced motion: 0 curl frames, one spread per turn.
  - Book → scroll kept page 136. Find "Needle" from page 1 → 136-137 in 0.9 s. Contents "Part 5" → 60-61.
  - Phone (400 px): one page at a time, bar clear of the tab bar. Ember and Nebula both checked.
  - Marquee: only the overflowing title moves; rest 5 s at x 0 with no left fade, then one linear pass at 45 px/s.
- Reviewer peer: two FIX rounds (stale module caches; auto-scroll running away through a zoomed spread), both fixed and re-checked; final verdict LGTM. All T47 findings closed.
- Not run: gitleaks is not installed on this machine, so the commit's local secret scan was skipped (CI scans the whole history). Forged-commit check on `main..HEAD`: clean.

## Next steps

1. The user merges the PR.
2. Owner run on the real 14,038-page PDF: it has `mode = scroll` (made before T47), so one tap on **Book**. Check a cover appears in the library after the first open.
3. Small fix first (user 2026-11-06, kept out of T47): Home's pinned billing cycle (`components/money/renewal-cycle.tsx` `writePin`/`readPin`) loses the pick in a private window that refuses `localStorage` writes, even though its comment says it lasts until reload. Move it onto the reader's device-pref pattern (`components/reader/device-pref.ts`: in-memory fallback when `setItem` throws, cleared after a successful write; lift the factory to `hooks/` if Home uses it), or make the same fix in place.
4. Next checkpoint: **T48** (Markdown / text viewer), then T49 (Markdown and text as a paged book, plus polish found in T47: CMaps and standard fonts, a `pages` count on the document).

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04,
tightened 2026-11-05): build features; tests only where they guard real logic or a spec exit
case; keep tripwire, forged-commit check and CI; one typecheck + test run before a commit;
after the Reviewer peer's LGTM (or LGTM with nits) commit, push and open the PR without asking
(user 2026-11-05); merge and db:migrate stay the user's. A short hand-off + continuation prompt
after every PR. No worktrees. One checkpoint per session. House goal (CLAUDE.md): native-app
feel, V24.

Read docs/handoff/2026-11-06-phase-5-pdf-viewer.md first and check that T47's PR is merged
(git log main). Branch phase-5/md-viewer off main. First, a small fix (user 2026-11-06):
Home's pinned billing cycle in components/money/renewal-cycle.tsx drops the pick when
localStorage refuses writes; move it onto the device-pref pattern
(components/reader/device-pref.ts, lifted to hooks/ if shared) or fix it in place. Then build T48 per SPEC §T and V40, V41:
the Markdown / text viewer with react-markdown 10.1.0 + remark-gfm 4.0.1 + rehype-sanitize
6.0.0 (already pinned) + rehype-slug 6.0.0; order sanitize → slug → Shiki (ids prefixed
`user-content-`; Shiki styles survive); shiki 4.5.0 fine-grained createHighlighterCore with the
JS regex engine (no Oniguruma WASM); a TOC; progress by heading anchor (`md:<heading-id>:<y‰>`).
Reuse the reader runtime and the PDF reader's stage, find and bar patterns where they fit.
Install only pinned versions (7-day cooldown; no bunx of unpinned tools).
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only. One pass, bugs and edge cases only, verdict LGTM / LGTM with nits / FIX, sent to the
Builder. Your LGTM is not the user's approval.
Target: the T48 diff on phase-5/md-viewer. Riskiest: sanitize order (sanitize before slug and
Shiki; no raw HTML, no MDX; `javascript:` links dropped; external links new tab + noopener),
Shiki output as the only dangerouslySetInnerHTML, heading-anchor locators resuming across
devices, V24 (no skeleton on a hop). Context: docs/handoff/2026-11-06-phase-5-pdf-viewer.md.
```
