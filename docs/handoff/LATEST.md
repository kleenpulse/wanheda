# Latest hand-off

**Newest:** [2026-11-06-phase-5-book-decision.md](2026-11-06-phase-5-book-decision.md). **T46 merged (#30, `379eb5e`) and `0007_reader` applied to Neon (user go-ahead, verified read-only). The user chose a FlipHTML5-style book as the PDF reader: spread + real page curl (`page-flip` 2.0.7), built in T47. SPEC V42, T47 and T49 amended on `phase-5/pdf-viewer` (1 local commit, not pushed).** T44 still waits for the first real Polar sale.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests). The Builder and Reviewer prompts below are copied from it.

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
