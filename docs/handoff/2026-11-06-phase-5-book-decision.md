# Hand-off — Phase 5: T46 merged, 0007 applied, book view decided (before T47)

| | |
|---|---|
| Date | 2026-11-06 |
| Phase / checkpoint | T46 done and merged. T47 next, scope widened by the user |
| Branch | `phase-5/pdf-viewer` off main `379eb5e`, one local commit with this SPEC amendment and hand-off. Not pushed |
| Previous hand-off | docs/handoff/2026-11-06-phase-5-reader-core.md |
| Open PR | none |

## State in one paragraph

PR #30 (T46) is merged as `379eb5e`; CI passed and the merge commit passed the forged-commit check. `drizzle/0007_reader.sql` is **applied** to Neon (user go-ahead, 2026-11-06, via `bun --env-file=.env.local run db:migrate`). A read-only check afterwards: the five tables have RLS on, and their uniques, checks, composite FKs and indexes match the SQL; `drizzle.__drizzle_migrations` holds 8 rows, the last stamped with 0007's journal time. The owner has used it: a 14,038-page PDF opened on their account in the T46 stopgap viewer. The user then showed a FlipHTML5 recording of what they want the reader to be, and the book view was decided (below).

## Decisions (user, 2026-11-06)

- **PDFs open as a book by default:** a two-page spread with page turns, one page on narrow screens. Scroll stays one tap away and is remembered per document.
- **Real page curl:** the page bends and shades as it turns, through `page-flip` 2.0.7 exact, wrapped by hand (never `react-pageflip`). Check its supply chain before installing (0 dependencies, no install scripts, published at least 7 days ago).
- **Built in T47**, not T49. T49 becomes Markdown and text as a paged book.
- What the recording shows and V42 now asks for: a dark stage; a spread with a spine shadow and a page-edge stack; full-height edge arrows; a bottom bar with zoom, a thumbnail grid, first / previous / an editable `a-b / N` page field / next / last, and fullscreen. No ads, and no share or print yet.
- Reduced motion: no curl, the page swaps at once; the book is still offered.
- New PDFs get mode `flip`. The PDF the owner already added has `scroll` (made before T47) and switches with one tap.

## Verification

SPEC and docs only on this branch. `main` at `379eb5e`: tripwire clean. The dev server on port 3000 still served the old Bench grid CSS (removed in PR #29); restarting it fixes that (delete `.next/dev` if a restart alone doesn't).

## Next steps

1. A fresh session builds **T47** on this branch (check `git log` first).
2. Reviewer pass, then commit, push and PR. The user merges.

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04,
tightened 2026-11-05): build features; tests only where they guard real logic or a spec exit
case; keep tripwire, forged-commit check and CI; one typecheck + test run before a commit;
after the Reviewer peer's LGTM (or LGTM with nits) commit, push and open the PR without asking
(user 2026-11-05); merge and db:migrate stay the user's. A short hand-off + continuation prompt
after every PR. No worktrees. One checkpoint per session. House goal (CLAUDE.md): native-app
feel, V24.

Read docs/handoff/2026-11-06-phase-5-book-decision.md first. You are on branch
phase-5/pdf-viewer (one local commit: the V42/T47/T49 amendment). Build T47 per SPEC §T and
V40, V41, V42 (amended), V43. The PDF reader is a FlipHTML5-style book by default: two-page
spread (one page on narrow screens), real page curl via page-flip 2.0.7 exact (supply-chain
read first; never react-pageflip), full-height edge arrows, bottom bar (zoom, thumbnails grid,
first/prev/editable page field/next/last, fullscreen), dark stage; scroll view as the
alternative (virtual pages, text layer, find, outline). pdf.js: react-pdf 11.0.0 +
pdfjs-dist 6.3.289 exact, client-only, worker via new URL(..., import.meta.url) never copied
to public/ (no tracked .mjs), isEvalSupported false; render only the spread ± 1 and free
canvases. Progress `pdf:<page>:<y‰>` through the existing reader runtime; new PDFs get mode
flip; replace the iframe stopgap in components/reader/document-view.tsx; page-one covers as
webp in OPFS (`<sha>.cover.webp`). Reduced motion: no curl, instant page swap.
Install only pinned versions (7-day cooldown; no bunx of unpinned tools).
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only. One pass, bugs and edge cases only, verdict LGTM / LGTM with nits / FIX, sent to the
Builder. Your LGTM is not the user's approval.
Target: the T47 diff on phase-5/pdf-viewer. Riskiest: pdf.js hardening (isEvalSupported false,
same-origin worker, no tracked .mjs); react-pdf, pdfjs-dist and page-flip versions exact and
page-flip's supply chain; memory on a 14,000-page PDF (only spread ± 1 rendered, canvases and
page images freed); locator kept across book ↔ scroll and resume; reduced motion (no curl);
V24 (no skeleton on a hop). Context: docs/handoff/2026-11-06-phase-5-book-decision.md.
```
