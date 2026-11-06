# Hand-off — Phase 5: Markdown and text reader (T48)

| | |
|---|---|
| Date | 2026-11-06 |
| Phase / checkpoint | Phase 5 CP3: T48 built, PR open |
| Branch | `phase-5/md-viewer` |
| HEAD | `507acff` — feat: Markdown and text reader (T48); this hand-off follows it |
| Open PR | #33 (https://github.com/kleenpulse/wanheda/pull/33), not merged |
| Previous hand-off | docs/handoff/2026-11-06-phase-5-pdf-viewer.md (it called PR #32 "awaiting merge": #32 was merged as b5b664b before this session began) |

## State in one paragraph

Markdown and text files open in Wanheda's own reader: a sheet of paper on the PDF reader's dark stage, with the same bars, find, paper colours and auto-scroll. The place is a heading plus how far through that section (`md:<heading>:<y‰>`), so it resumes in the same part of the same section on any width or text size. Code is highlighted by Shiki in the browser, with no Oniguruma WASM. The PDF and text readers now share one set of stage controls. Home's pinned billing cycle survives private windows. Plain scrollers app-wide fade at the edges that have more to scroll.

## Done this session

- **Renewal-cycle pin fix** (user 2026-11-06): `createDevicePref` moved to `hooks/device-pref.ts`; Home's pin uses it (same key `wanheda-home-cycle`), so a refused `localStorage` write keeps the pick until reload.
- **T48** (SPEC §T row has the full build note). Files: `lib/reader/md.ts` (pure place math, find, fence names), `lib/reader/md-pipeline.ts` (the one plugin list), `lib/reader/md.test.ts`, `components/reader/md/` (`md-reader.tsx`, `md-body.tsx`, `highlight.ts`).
- **Shared chrome** `components/reader/chrome.tsx` (Stage, Bar, useChrome, useStage, useAutoScroll, AutoScrollControl, FindBox, ShowControls), extracted from `pdf-reader.tsx` with no behaviour change. `paper.tsx` moved to `components/reader/`.
- **User asks mid-session (2026-11-06):**
  - The mouse wheel over the auto-scroll control changes its speed (2 steps a notch, trackpad deltas summed, page doesn't scroll). Both readers.
  - Scroll fades on every plain scroller (17), using `scroll-fade` / `scroll-fade-x` from `shadcn/tailwind.css`, which the app already imports (CSS scroll-driven animations, no JS; after Motion Garden's `AutoMaskVertical`). Not on the reading stages, nor on scrollers that paint their own fill or ring (nav rail, route tabs, chart table, import list, money sheet): the mask would fade the box itself.
- **Fixed on the way:** CRLF text files rendered as one paragraph (the T46 stopgap had the same bug).

## Things the next session must know

- **Sanitize order** is sanitize → slug → Shiki. remark-rehype must keep `clobberPrefix: ""`: sanitize adds `user-content-` itself, and both doing it doubled footnote ids. In-document `#x` links are resolved to `user-content-x` on click.
- **V41 amended:** locator headings are the slug without the prefix, in github-slugger's alphabet (Unicode letters, digits, marks, `_`, `-`, ≤ 200). "" means before the first heading (or the whole of a heading-less document). Old T46 stopgap locators `md::<y>` were whole-document fractions; in a document with headings they now resume within the lead-in. Only a day of stopgap progress exists.
- **Place keeping:** the ResizeObserver re-measures always and restores only when the article's width or the text scale changed. Height-only changes are left to native scroll anchoring. A scroll event that arrives before the re-measure (anchoring scrolls first) is ignored. Don't add `overflow-anchor: none` back.
- **The find index** puts a `\n` between text nodes in different blocks, so matches don't run across paragraphs.
- **Shiki** themes are github-light and github-dark, emitted with `defaultColor: false`, so spans carry `--shiki-light` and `--shiki-dark` and `.paper-night` picks the dark one. Blocks over 40,000 chars stay plain.
- **Browsers without scroll timelines** (likely Firefox): shadcn's `scroll-fade` shows its fades all the time there, even on lists that don't scroll.
- **CSS build warnings:** an uncached `next build` prints 2 lightningcss warnings. The one read names the `::highlight(reader-find…)` rules; they are emitted unchanged and work in Chrome. The other was not read.

## Verification (actual results)

- `bun run typecheck` clean; `bun run test` 88 files / 936 pass (one full run had 2 unrelated flakes in money-runtime and auth/server, both green alone and in the next full run); `bun run tripwire` clean; ESLint clean on every touched file (pre-existing weather-widget error untouched); forged-commit check on `main..HEAD` clean. gitleaks not installed locally (CI scans).
- Zero-env production build on 3043 (the user's dev server holds 3000):
  - A hostile Markdown file (raw HTML, `<script>`, `onclick`, `javascript:`, relative links and images) left 0 scripts or handlers; `javascript:` dropped; the https link opens in a new tab with `noopener noreferrer`; the https image has no referrer and loads lazily; the relative one shows its alt text.
  - 3 code blocks highlighted, unknown language plain, 0 WASM requests; no onig wasm in `.next/static`.
  - `#section-30` link → heading 72 px under the top, URL unchanged.
  - Place held: 452‰ through text size ×3; 600‰ through width 1400 → 700 → 1400 and text ±; 400 px added below the line → the text under it doesn't move; 300 px above → anchoring holds it.
  - Hop library → document: one frame, no busy state, 84 ms (175 ms before caching the parse tree).
  - Find "hidden needle" from §30 → §44 (2 of 2) → wraps to §17; "17.the" → no match; "section 17. the hidden" → 1 of 1.
  - Dark amber paper → dark Shiki colours; 400 px phone bar fits; wheel on the speed control 50 → 52 → 50 → 56, page doesn't scroll; contents list fades at top, bottom or both by scroll position. 0 console errors.
- Reviewer peer: FIX (restore on every height change moved the text when a lazy image below loaded) + a nit (find across blocks); both fixed, plus a race found while verifying (anchoring scroll before re-measure); re-check LGTM.

## Next steps

1. The user merges PR #33.
2. Owner run: open a real Markdown file from this device (OPFS), read partway, then open it on a second device and check it resumes in the same section.
3. Next checkpoint: **T49**, Markdown and text as a paged book, plus polish found in T47 (CMaps and standard fonts for pdf.js; a `pages` count on the document).
4. T44 still waits for the first real Polar sale.

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04,
tightened 2026-11-05): build features; tests only where they guard real logic or a spec exit
case; keep tripwire, forged-commit check and CI; one typecheck + test run before a commit;
after the Reviewer peer's LGTM (or LGTM with nits) commit, push and open the PR without asking;
merge and db:migrate stay the user's. A short hand-off + continuation prompt after every PR.
No worktrees. One checkpoint per session. House goal (CLAUDE.md): native-app feel, V24.

Start from docs/handoff/LATEST.md and docs/handoff/2026-11-06-phase-5-md-viewer.md, then
verify against the repo (git, tripwire, typecheck, tests). Check PR #33 (T48) is merged
(git log main). Branch phase-5/<slug> off main for T49 per SPEC §T: Markdown and text as a
paged book (V42), reusing components/reader/chrome.tsx and the md reader's place
(`md:<heading>:<y‰>`), plus the T47 polish (pdf.js CMaps and standard fonts served
same-origin; a `pages` count on the document). Install only pinned versions (7-day cooldown;
no bunx of unpinned tools).
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only. One pass, bugs and edge cases only, verdict LGTM / LGTM with nits / FIX, sent to the
Builder. Your LGTM is not the user's approval.
Target: the T49 diff. Riskiest: the md place surviving the switch between scroll and book,
pagination on width and text-size changes, CMaps and fonts served same-origin only (V40),
V24 (no skeleton on a hop). Context: docs/handoff/2026-11-06-phase-5-md-viewer.md.
```
