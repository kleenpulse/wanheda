# Hand-off — Phase 6: Voice — CP4, the read-along (T56)

| | |
|---|---|
| Date | 2026-11-06 |
| Phase / checkpoint | Phase 6, CP4 = T56 read-along done (uncommitted, awaiting the Reviewer) |
| Branch | `phase-6/read-along` (off `main` at `5c28cae`; forged-commit check on `cad5cac..origin/main` clean, 2 commits) |
| HEAD | `5c28cae` — Merge pull request #40 (the work is uncommitted on top) |
| Previous hand-off | docs/handoff/2026-11-06-phase-6-voices.md |

## State in one paragraph

The reader reads aloud. "Read aloud from here", in the bottom bar of both readers, starts at the first sentence at or after the shown place. For a PDF that's the place's page and line. For Markdown and text it's the text.json estimate, refined to the first sentence on or below the reading line. The spoken sentence is highlighted: with a CSS Custom Highlight in Markdown (scroll, and the book's page copies), and with boxes built from the page's text runs in a PDF (an overlay in the scroll, a `.book-say` layer in the book, whose pages are images). Follow scrolls the sentence to the reading line once it leaves the view, or turns the book to its page. Owner navigation turns follow off while the voice goes on: wheel, a drag on the page, navigation keys, the bars' turns, the contents, find. An arrow pill, "Back to the voice", then points ↑ ↓ ← → at the sentence. A click or Enter turns follow back on. While follow is on, the voice's sentence is the reader's saved place: a PDF saves its locator, Markdown saves the `placeAt` for its measured line. Each saves through `resume.follow()` as an owner move, and a newer place from elsewhere doesn't move the view. Play before text.json starts the extraction at once and shows "Getting text" with the PDF's page progress. Notes have a "Read aloud" button.

## Done this session

- **Verified on start:** `main` = `origin/main` = `5c28cae` (#40 merged); forged-commit check `cad5cac..origin/main` clean; tripwire clean; typecheck clean; tests 1066/1066.
- **`lib/reader/read-along.ts`** (pure, tested):
  - `NormBuilder` does `cleanText` with a map from each character to its piece and offset;
  - `pageText` is SentenceStream's own join;
  - `sentenceHits` uses a 48-char probe and caps at 64 hits. A PDF sentence that runs over a page break gives `rest`. A tail shorter than the probe is found too;
  - also `continuedHit`, `spanPieces`, `nearest`, `firstPdfSentence` (8 ‰ slack), `mdOrder` + `firstMdEstimate`, `mdVoiceLocator`, `directionOf` and `pageDirection`.
- **`components/reader/read-along.tsx`:**
  - the `useReadAlong` hook drives a per-reader `ReadAlongTarget` (startAt, mark, bring, where, save);
  - it looks again on stage scroll (capture), on resize and on turns, and saves once `where` returns null;
  - follow-off listeners skip the bars, panels and menus (`data-reader-bar`, `aside`, roles);
  - also `ReadAloudControls` and `FollowPill`.
- **Markdown:**
  - `MdView` has `say`, `bring`, `where`, `placeOf`, `placeY` and `placeLineY`;
  - the scroll paints `reader-say` (priority −1, under find). The book carries the range into its page copies, as find does, and holds the sentence's place before it turns, so the turn counts as the voice's;
  - `md-reader.tsx` finds sentences with a DOM index that skips what the extractor skips (code, images, footnotes and their markers; `<br>` reads as a space). It looks after the previous sentence it found, else nearest the estimate.
- **PDF:**
  - `engine.ts` `sentenceBoxes` caches the last 4 pages' runs and gives each run its share of the box, by characters;
  - `scroll-view.tsx` adds the `SayMarks` overlay, plus `where` and `bring` on its handle;
  - `book-view.tsx` adds the `.book-say` layer;
  - `pdf-reader.tsx`: while following, a spread that doesn't hold the voice's page counts as the owner's turn.
- **`resume.ts`:** `follow()` opens the V41 gate itself. `voiceHolds` keeps a newer place from elsewhere from remaking the view, while still advancing `shownAt`, so this device's next save wins.
- **Text worker:** a `progress` message (pages done of total, at most every 150 ms) goes into `useTextProgress`. `textOutcome` reports `busy` or `failed`. `extractPdf` takes an `onPage` callback; its output is unchanged and a test asserts it, so there's no `EXTRACTOR_VERSION` bump.
- **`lib/speech/store.ts`:** `primeSpeech()` unlocks the audio in the press, since read-along plays after an await.
- **`components/speech/use-speech-error.ts`:** toasts a speech failure only when it happens while the surface is open.
- **Notes:** `ReadNote` in the note editor reads the title and body through `speakableSentences`, with read, pause and stop. An empty note says so.
- **CSS:** `::highlight(reader-say)` uses signal at 18%. Bars carry `data-reader-bar`.
- **SPEC:** T56 is done (x), and V48 has a Builder amendment.

## Verification (actual results)

- **Gates:**
  - typecheck clean;
  - tests **1078/1078** across 102 files (12 new, in `lib/reader/read-along.test.ts`). Under load from other sessions, two untouched tests (`lib/auth/server.test.ts`, `components/money/money-runtime.test.ts`) timed out once; alone they pass, and the next full run was clean;
  - tripwire clean;
  - `bun run build` passes;
  - ESLint on every touched file is clean, except two pre-existing `no-unnecessary-condition` hits in lines this branch didn't touch (`text.worker.ts:56`, `store.ts:187`).
- **Browser check:** demo mode on a production build served on :3046 (stopped afterwards). The voice was Web Speech, since that origin holds no Piper voice. Fixtures were made in the scratchpad: a long-lined `long-walk.md` (3 chapters × 6 paragraphs) and a hand-built 3-page Helvetica `harbour.pdf`. Results:
  - **Seed md:** play pressed under 3 s after the open (before text.json) extracted at once. Speech started on the heading and the highlight moved to the next sentence.
  - **long-walk scroll:** scrolled to 1100 px, the reading line fell on the tail of a sentence, and play started at the next one (sentence 1 of paragraph 5).
    - A wheel turned follow off. The pill read ↓ with the view above the voice and ↑ below it.
    - Clicking the pill put the sentence's top on the reading line (265 px = the line) and the pill went. The voice kept going.
  - **long-walk book:**
    - a switch to Book opened on spread 6–7, with the voice's sentence on page 7;
    - the book turned by itself to 10–11 as the voice went on, and a sentence across the gutter was lit on both pages;
    - the header's percent rose (place saved);
    - the bar's Next turned follow off with the pill ←, and a click brought the book back.
  - **harbour.pdf:**
    - "Getting text" then "0%" showed, then speech;
    - in the book, the boxes sat exactly on "A boy counted the boats and lost his place twice." across its two lines;
    - in the scroll, the boxes sat over the text-layer page with `pointer-events: none`.
  - **Notes:** "Reading list" read, paused (`speechSynthesis.paused`), resumed and stopped.
  - **Console:** 0 errors, 0 warnings.
- **Not checked in the browser:**
  - Piper timing (the 150 ms switch rides the queue's 50 ms tick on the AudioContext clock: by construction, not measured here);
  - a PDF sentence crossing a page break (unit-tested only);
  - reduced-motion follow (it jumps by code path: `behavior: "instant"`, and the flip-book's `reduced`);
  - owner mode's real save to the server (demo folds the save into the library cache);
  - phone touch-drag.

## Decisions made (Builder calls, in V48's amendment)

- **PDF highlight = boxes** from the page's text runs, in both views, because the book's pages are images. The scroll uses an overlay beside the text layer, not inside it, so selection is untouched.
- **Scroll follow moves once a screenful.** The sentence's top goes to the reading line only when it leaves the view. The spec's "scroll into view" is met with less motion.
- **Turns made with the reader's own controls turn follow off:** prev/next, the page field, contents, thumbnails, a find hit, in-document links. Mode switch, zoom, paper, text size and hide don't. While follow is on, the reader's own scroll and turn reports don't save; the voice saves.
- **Pill label "Back to the voice"**, in the signal hue on the stage, springing in with `BANNER_SPRING`.
- **Progress counts PDF pages only.** Markdown and text extract in well under a second, so they show an indeterminate spinner.
- **A `busy` extraction** (another tab) is retried every 2 s for up to 3 min, then a toast says so.

## Known problems and risks

- **The reader controls are minimal:** play, pause and stop. Prev/next sentence, speed, voice, the sleep timer, the island card and Media Session are T57.
- **Markdown text the extractor reads but the DOM renders differently won't highlight.** Follow then has nothing to bring, and that sentence's place isn't saved. The voice carries on, and the next sentence that's found saves.
- **The Markdown index is rebuilt** after any mutation of the article (code colours arriving, a view switch). It is O(text), the same as find's.
- **The owner's dev server on :3000 still needs a restart** (the stale SSR module from the T55 hand-off) before an owner run.
- The T54 and T55 risks still stand.

## Next steps (in order)

1. **Reviewer:** one pass on the uncommitted diff (prompt below). On LGTM the Builder commits, pushes and opens the PR; the user merges.
2. **Stop.** T57 (CP5, speech surfaces) starts in a fresh session.
3. Still open with the user, not to act on unasked: the Phase 5 owner run, eager remote images in the md book, pdf.js painting in a worker, asking before jumping to another device's newer place, the stale remote branch `phase-5/reader-core`, T52 and T44, and the reader-prefs owner check (#39).

## Files to stage (by name)

`SPEC.md`, `app/globals.css`, `lib/reader/read-along.ts`, `lib/reader/read-along.test.ts`, `lib/reader/extract.ts`, `lib/reader/device-protocol.ts`, `lib/speech/store.ts`, `components/reader/read-along.tsx`, `components/reader/resume.ts`, `components/reader/chrome.tsx`, `components/reader/text.ts`, `components/reader/text.worker.ts`, `components/reader/md/view.ts`, `components/reader/md/md-reader.tsx`, `components/reader/md/md-scroll.tsx`, `components/reader/md/md-book.tsx`, `components/reader/pdf/engine.ts`, `components/reader/pdf/pdf-reader.tsx`, `components/reader/pdf/scroll-view.tsx`, `components/reader/pdf/book-view.tsx`, `components/notes/note-editor.tsx`, `components/speech/use-speech-error.ts`, `docs/handoff/2026-11-06-phase-6-read-along.md`, `docs/handoff/LATEST.md`.

## Env / services touched

None in the repo. In Chrome, for origin localhost:3046, demo-mode files were uploaded into the tab only. Fixtures live in the session scratchpad (`docs/long-walk.md`, `docs/harbour.pdf`, `mkpdf.ts`), not committed.

## Review state

Reviewer (wanheda-2a): pass 1 **FIX**, two findings, both fixed; pass 2 **LGTM with nits** (its panel-scrollbar nit taken). The findings:

- **Paused voice held the place.** `holding` was `active && following`, and `active` includes paused. Now it's `holdsPlace(status, following)` (pure, in `read-along.ts`, tested): only `playing` and following. Paused or follow off means V41 as is.
- **A navigation key from a focused button** (Pause, after a press) moved the md or pdf scroll without turning follow off, and the voice pulled the view back. Both readers' `onKey` now call `turned.current()` when they act on a turn key. Browser-checked on md scroll: play, Pause, Resume, then →. The view stayed, the voice went on, and the pill showed once the sentence left the view.

Nits:

- (a) taken: a press on the page scroller's scrollbar (offset past `clientWidth` or `clientHeight`; not a panel's, which is NOT_PAGE) turns follow off. Browser-checked: the pill showed and the view stayed.
- (b) declined: a page may hold a sentence whole and also run it on at its foot (a repeat), and `nearest()` needs both.
- (c) taken: `target.save` returns whether it saved, and `savedFor` is set only then.

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only. One pass, bugs and edge cases only, verdict LGTM / LGTM with nits / FIX, sent to the
Builder. Your LGTM is not the user's approval.
Target: the uncommitted T56 diff on branch phase-6/read-along (files listed in
docs/handoff/2026-11-06-phase-6-read-along.md).
Check: lib/reader/read-along.ts matching (pageText parity with SentenceStream, run-on page break,
repeated sentences); md DOM index vs the extractor's skips; follow-off triggers and what must NOT
trigger them; the save gate (resume.follow, voiceHolds, reports suppressed while following, book
turn = follow off); play before text.json (busy retry, cancel, stale generations); PDF box math.
Context: SPEC V41, V44, V48 (T56 amendment), the hand-off above.
```

### Builder prompt (Phase 6, CP5)

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda (lean mode, one checkpoint,
no worktrees; rules in CLAUDE.md and docs/handoff/README.md).
Start from docs/handoff/LATEST.md → docs/handoff/2026-11-06-phase-6-read-along.md; verify
(git, tripwire, typecheck, tests). PR merged? Forged-check the merge range before pulling.
Next: T57 `phase-6/speech-surfaces` (SPEC V49): island `speech` activity card, TTS mini window,
shared controls (play|pause, prev|next, speed, voice, sleep timer), Media Session.
The speech store is lib/speech/store.ts; the reader's read-along is components/reader/read-along.tsx.
```
