# Hand-off — Phase 5: sentence extraction with locators (T50)

| | |
|---|---|
| Date | 2026-11-06 |
| Phase / checkpoint | Phase 5 CP5: T50 built, PR open |
| Branch | `phase-5/text-extract` (off `main` at `83a26de`, PR #34 merged) |
| HEAD | this hand-off on top of `2e48fbb` (T50) |
| Open PR | #35 (https://github.com/kleenpulse/wanheda/pull/35), not merged |
| Previous hand-off | docs/handoff/2026-11-06-phase-5-md-book.md |

## State in one paragraph

After a document is first opened on a device, a worker extracts its sentences, each with the reader's own place (V41), and keeps them beside the file as `<sha256>.text.json` in OPFS (demo: in the tab). Phase 6 reads them with `readText(sha256, demo)` (`components/reader/text.ts`). The extractor is versioned (`EXTRACTOR_VERSION` in `lib/reader/extract.ts`); a file that was cut short, is older or belongs to another file is extracted again. Nothing in the UI changed.

## Done this session

- **T50** (SPEC §T row has the full build note; V44 amended). New: `lib/reader/extract.ts` (+ test), `components/reader/text.worker.ts`, `components/reader/text.ts`, `components/reader/pdf/source.ts` (same-origin data factory and range reader, moved out of `engine.ts`, shared by reader and worker). `mdTree` in `md-pipeline.ts`; `textName` / `readTextFile`; `removeDeviceFile` drops the text too; `document-view.tsx` calls `ensureText` 3 s after open.
- **Found in the browser and fixed**: micromark's entity decoder resolved its DOM build in the worker bundle (`document.createElement` threw). `next.config.ts` now has a turbopack `resolveAlias` to its table build (+37 KB raw on the Markdown chunk).
- **Fixed on the way**: `placeAt` was called against every heading for every sentence (28k × 3.8k on a 5 MB file); a moving section pointer makes it linear, same output.
- **Reviewer peer**: FIX (deleting a document during a Markdown job left the full `text.json` forever: the parse and write never yield, so the cancel lands late, and the delete's own removal fails on the sync handle's lock) → after closing, the worker removes the text if the bytes are gone or the job was aborted; demo drops a result whose document was forgotten mid-job. Nit (NaN run top) taken. → LGTM.
- PR #35 opened after the LGTM (lean-mode rule). PR #34 is merged (`83a26de`); the previous LATEST still called it open.

## Things the next session must know

- **pdf.js in a worker**: our worker starts pdf.js's worker itself and hands it over (`PDFWorker.create({ port })`). Without a port pdf.js reads `window.location`; importing `pdf.worker` into our scope would bind it to our `self` and answer our messages.
- **Turbopack workers** load through a classic bootstrap (`turbopack-worker-*.js#params=…`, uses `importScripts`), so `new Worker(url, { type: "module" })` on that URL fails; the app's own factory gets it right. Turbopack also emits each worker's raw `.ts` source into `static/media` (already true for `hash.worker.ts`).
- **md places in text.json are estimates**: y counts estimated lines (70 chars a line, +1 per block), because a worker has no layout. Heading is exact. Phase 6 should find the exact sentence on the open page by its text.
- **File format**: `{"v":N,"kind","sha256","sentences":[{i,text,locator}…],"complete":true}`. `isCurrent(head, tail)` needs only the first 64 and last 18 bytes.
- **Cost**: 14,038 pages → 41.7 s, 18.9 MB file. 5 MB Markdown → 5.6 s in Chrome's worker (the parse itself; the reader runs the same parse on its main thread when it opens such a file).
- **Testing the worker by hand**: open any document, read the `turbopack-worker` URL from `performance.getEntriesByType("resource")`, then `new Worker(url)` (classic) and post `{ type: "extract", id, sha256, kind, file, keep }`. OPFS dir is `wanheda-reader/`. Clean up the test files afterwards.
- `bun run test` pdf.js tests use `pdfjs-dist/legacy/build/pdf.mjs` (the modern build wants `Uint8Array#toHex`, newer than Node 24.22).

## Verification (actual results)

- `bun run typecheck` clean; `bun run test` 90 files / 970; `bun run tripwire` clean; ESLint clean on touched files; forged-commit check on `main..HEAD` clean. gitleaks not installed locally (CI scans).
- Zero-env production build on 3043 (the user's dev server keeps 3000). Highlights: CMap PDF → `αβγδπ 日本語テキスト` at `pdf:1:64`; current file → `current` in 5 ms; v0 and cut-short files re-extracted; second tab `busy`; cancel mid-giant leaves no file; delete mid-job (with and without a cancel message) leaves no text; longest main-thread frame during the giant 22 ms. Bench (bun, GC forced): heap 79 → 95 MB over 12,000 pages.

## Next steps

1. The user merges PR #35.
2. Owner run (still open): a real Markdown file in the book, resumed on a second device; a real CJK PDF; now also a `text.json` written on a signed-in device.
3. User decision still pending: should the book load remote Markdown images lazily.
4. Next checkpoint: **T51**, the Phase 5 exit (300-page PDF < 2 s with a perf trace, desktop → phone same page, flip with keys and swipe, reduced motion) and the Phase 5 done hand-off with Phase 6 prompts.
5. T44 still waits for the first real Polar sale.

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04,
tightened 2026-11-05): build features; tests only where they guard real logic or a spec exit
case; keep tripwire, forged-commit check and CI; one typecheck + test run before a commit;
after the Reviewer peer's LGTM (or LGTM with nits) commit, push and open the PR without asking;
merge and db:migrate stay the user's. A short hand-off + continuation prompt after every PR.
No worktrees. One checkpoint per session. House goal (CLAUDE.md): native-app feel, V24.

Start from docs/handoff/LATEST.md and docs/handoff/2026-11-06-phase-5-text-extract.md, then
verify against the repo (git, tripwire, typecheck, tests). Check PR #35 (T50) is merged
(git log main) and check its incoming commits for forgeries before pulling. Branch
phase-5/<slug> off main for T51 per SPEC §T, the Phase 5 exit: 300-page PDF < 2 s with smooth
scroll (perf trace); close on desktop → open on phone ⇒ same page; flip with keys and swipe,
falls back under reduced motion; then the Phase 5 done hand-off with Phase 6 prompts (voice
reads text.json via components/reader/text.ts readText). Install only pinned versions (7-day
cooldown; no bunx of unpinned tools).

Still open with the user, don't act on them unasked: the owner run (real md book resumed on
a second device, a real CJK PDF, text.json on a signed-in device), and whether the md book
should stop loading every remote image eagerly.
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only. One pass, bugs and edge cases only, verdict LGTM / LGTM with nits / FIX, sent to the
Builder. Your LGTM is not the user's approval.
Target: the T51 diff (Phase 5 exit). Riskiest: whether the perf trace really measures a cold
300-page open, the cross-device resume path (V41 locator, at-clock ordering), reduced-motion
fallbacks, and the Phase 6 prompts matching what T50 actually stores.
Context: docs/handoff/2026-11-06-phase-5-text-extract.md.
```
