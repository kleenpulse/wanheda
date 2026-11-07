# Hand-off — Phase 6: Voice — CP5, the speech surfaces (T57)

| | |
|---|---|
| Date | 2026-11-07 |
| Phase / checkpoint | Phase 6, CP5 = T57 speech surfaces done (Reviewer LGTM with nits, pass 2) |
| Branch | `phase-6/speech-surfaces` (off `main` at `510cc0c`) |
| HEAD | `510cc0c` — Merge pull request #41 (the work is uncommitted on top) |
| Previous hand-off | docs/handoff/2026-11-06-phase-6-read-along.md |

## State in one paragraph

Speech can be steered from anywhere in the shell. The island has a `speech` activity whenever the speech store isn't idle:
- the pill shows a progress ring and the percent;
- the card shows the title, "Sentence n of N", the sentence being spoken, and the shared controls;
- "Open" goes back to the document or note.

A new mini window, `reader.speech` ("Read aloud", in the Reader's manifest), has the same controls. It opens from a new button in the reader bar while speaking, or from the dock and the palette.

The controls are:
- prev, play/pause, next sentence and stop;
- chips for speed, voice and sleep. Each press moves a chip to its next choice.

The sleep timer has 15, 30, 45 and 60 minutes, or end of chapter. When it fires it **pauses** speech. Chapters come from the document: in Markdown, the shallowest heading level used twice; in a PDF, the contents list's top level.

The Media Session shows the title, follows play/pause, and maps the media keys to the store. Previous and next track step one sentence.

## Done this session

- **Verified on start:** PR #41 merged (`510cc0c`); forged-commit check on `5c28cae..origin/main` clean (2 commits); local `main` fast-forwarded; tripwire clean. The Reviewer's main check passed.
- **T56 review loop, closed:**
  - pass 1 was FIX (a paused voice held the place; a nav key from a focused button didn't turn follow off);
  - both were fixed, plus nits (a) and (c);
  - pass 2 was LGTM with nits (the panel-scrollbar nit was taken);
  - commit `b13fc0b`, PR #41, merged by the Builder on the user's own instruction for the night.
- **`lib/speech/sleep.ts`** (pure, tested): `SleepChoice`, `Sleep`, `SLEEP_MINUTES`, `chapterEnd`, `startSleep`, `nextSleep` (the chip's cycle; end of chapter only when there are chapters), `sleepLabel`.
- **`lib/speech/store.ts`:**
  - new state: `startedAt`, `chapters`, `sleep`;
  - new actions: `setSleep`, `setChapters(id, starts)`;
  - `SpeechSource.href`;
  - `spokenText(i)`;
  - end of chapter pauses in `onSentence` once the voice reaches the next chapter's first sentence;
  - a minute timer pauses through `armSleep`;
  - `seek` re-aims end of chapter at the chapter being read now;
  - `setVoice` while speaking replays from the current sentence with the new voice, and keeps the sleep timer, `startedAt` and the paused state;
  - `finish()` clears the sleep timer.
- **`lib/reader/read-along.ts`:** `mdChapterStarts` (text before the first chapter is front matter) and `pdfChapterStarts`.
- **`components/reader/pdf/engine.ts`:** `chapterPages(pdf)`, the outline's top level, or the level under a single root entry.
- **`components/reader/read-along.tsx`:**
  - `ReadAlongTarget.chapters`;
  - play passes `href` (`/reader?d=<id>`) and sets the chapters after the voice starts;
  - a "Read-aloud controls" button opens `reader.speech`;
  - detour: merged a duplicated doc comment on `save`.
- **Readers:** the md target gives `mdChapterStarts(list, headings)`; the pdf target gives `pdfChapterStarts(list, await chapterPages(pdf))`.
- **`components/speech/speech-controls.tsx`:** `SpeechTransport` and `SpeechOptions` in the `island` or `surface` tone (duo-tone fills, no borders), plus `speechProgress`.
- **`components/island/speech-activity.tsx`**, wired in `island.tsx`. Speech comes first in the list, and is brought forward when it started after the newest timer.
- **`components/speech/media-session.tsx`:** `SpeechMediaSession`, mounted in `shell-frame.tsx`.
- **`components/windows/speech-window.tsx`**, in `window-layer.tsx`'s `BODIES`.
- **`lib/modules.ts`:**
  - READER gains the `reader.speech` window (340×360) and `activities: ["speech"]`;
  - `WINDOWS`' `flatMap` calls are annotated, because a second app window broke the literal-type inference.
- **`components/shell/dock.tsx`:** `speech` goes live while the store isn't idle, so the Reader shows as running.
- **Notes:** a note's speech source carries `href: /notes?n=<id>`.
- **SPEC:** T57 is done (x), without the P1 audio cache. V49 has a Builder amendment.

## Verification (actual results)

- **Gates:**
  - typecheck clean;
  - tests **1084/1084** across 103 files (new: `lib/speech/sleep.test.ts` with 4 tests, and "chapters" in `read-along.test.ts` with 2);
  - tripwire clean;
  - `bun run build` passes;
  - ESLint on every touched file is clean, except the old `no-unnecessary-condition` in `store.ts`, now at line 199 after the additions above it.
- **Browser check:** demo dev server on :3043 (stopped afterwards), Web Speech, the scratchpad's `long-walk.md` (`#` title plus 3 `##` chapters, 58 sentences):
  - **Play:** the island showed the speech pill ("long-walk, reading, sentence 3 of 58", 5%). Media Session metadata was "long-walk" and `playbackState` was `playing`. The reader bar showed Pause, Stop and "Read-aloud controls".
  - **Island card:**
    - it showed the title, "Sentence 4 of 58", the spoken sentence and the controls;
    - Voice was disabled ("Browser voice", no Piper on this origin);
    - Speed went 1× → 1.25× and was saved in the speed pref;
    - Sleep cycled 15:00 → 30:00 → 45:00 → 60:00 → End of chapter, and the card stayed open.
  - **End of chapter:** stepped by hand to sentence 18 (chapter 1's last paragraph) and set the timer. The voice went on to sentence 21 ("Chapter 2") and paused there, and the sleep chip went back to off. Resume went on to 22.
  - **Mini window:** it opened from the reader bar on top of the reader, with focus inside, and showed the title, progress, the sentence and the controls. Stop cleared the island card, the Media Session (metadata null, `none`), the Web Speech voice and the reader's controls. The window then showed its idle text with the chips disabled.
  - **Console:** 0 errors, 0 warnings.
- **Not checked in the browser:**
  - switching voices (no Piper voice on the demo origin);
  - a minute sleep timer firing (unit-tested; it uses the same pause path as end of chapter);
  - PDF chapters (`chapterPages` has no fixture with an outline; `pdfChapterStarts` is unit-tested);
  - the hardware media keys and the lock screen (Media Session handlers were set; no keys were pressed);
  - phones.

## Decisions made (Builder calls, in V49's amendment)

- **Chips that cycle, not menus.** A menu's portal sits outside the island, so a press on it counts as outside and closes the card. The window uses the same chips, so the controls are shared.
- **Sleep pauses, it doesn't stop.** The place and the card stay, and a press goes on.
- **End of chapter pauses on the next chapter's first sentence,** when its `onSentence` fires. On Piper, a few ms of that sentence may sound before the pause. There is no "sentence ended" event to stop on.
- **A voice change applies at once** (V49: controls don't wait on the engine). Before, a change during speech waited for the next play.
- **Media Session prev/next = sentence.** Seek back and forward do the same.

## Known problems and risks

- **Media Session on Web Speech:** browsers may not show it or route the keys without audible media from the page. Piper plays through an AudioContext, which Chrome counts. Not measured.
- **Full screen:** the window layer isn't inside the reader's full-screen element, so the mini window doesn't show there. The reader's own controls still work.
- **The P1 audio cache** (FR-VOICE-9) is not started.
- **Dev only:** a hot reload of `lib/modules.ts` closed the open window. The speech went on.
- The T54–T56 risks still stand. The owner's :3000 dev server still needs a restart before an owner run.

## Next steps (in order)

1. **Done:** Reviewer LGTM (pass 2), then commit, push, PR and merge. A new session forged-checks the merge range before pulling `main`.
2. **T58** (P6 exit) needs the owner's machine: a downloaded Piper voice, network off, a perf trace and a scheduler log. Stop there and leave it to the user.
3. Still open with the user, not to act on unasked: the stale remote branches `phase-5/reader-core` and `phase-6/read-along`, and the items carried over from earlier hand-offs.

## Files to stage (by name)

`SPEC.md`, `lib/speech/sleep.ts`, `lib/speech/sleep.test.ts`, `lib/speech/store.ts`, `lib/reader/read-along.ts`, `lib/reader/read-along.test.ts`, `lib/modules.ts`, `components/speech/speech-controls.tsx`, `components/speech/media-session.tsx`, `components/island/speech-activity.tsx`, `components/island/island.tsx`, `components/windows/speech-window.tsx`, `components/windows/window-layer.tsx`, `components/shell/dock.tsx`, `components/shell/shell-frame.tsx`, `components/reader/read-along.tsx`, `components/reader/md/md-reader.tsx`, `components/reader/pdf/pdf-reader.tsx`, `components/reader/pdf/engine.ts`, `components/notes/note-editor.tsx`, `docs/handoff/2026-11-07-phase-6-speech-surfaces.md`, `docs/handoff/LATEST.md`.

## Env / services touched

None in the repo. In Chrome, for origin localhost:3043 (demo), a file was uploaded into the tab only, and the speed pref was set to 1.25 in that origin's localStorage.

## Review state

**Pass 2 (wanheda-2a): LGTM with nits.** The pass-1 FIX is confirmed fixed, with no new FIXes.
- Nit taken: Open or the title on the document already showing does nothing, so it doesn't push a duplicate history entry. The check is on `pathname + search`.
- Nit left: V49 says "that page's 1st sentence"; when that page has no text, it's the next page with text.

Then, on the user's standing instruction for this run: commit, push, PR and merge.

**Pass 1 (wanheda-2a): FIX**, one item and six optional nits, all fixed or answered:

- **FIX, taken.** In `media-session.tsx`, `playbackState` went to `none` when a second source started mid-speech. The state effect now also depends on `title` and `kind`, so it runs after the metadata effect's cleanup. Browser check (demo :3043, Web Speech): play `alpha`, then `beta` without stopping, and the state is `"playing"` with title "beta". Stop gives `none` and the metadata is null.
- **Nit (a), taken.** On lock loss, the store clears the sleep timer and `sleep`.
- **Nit (b), taken.** `useOpenSpeechSource()` in `speech-controls.tsx` is shared by the island's "Open" and the window's title, now a button. On the same app it uses `pushUrl`, as the palette does; elsewhere it uses `router.push`. Browser: from the reader's library, the window title opened `beta` in place; from `/notes` it went to `/reader?d=…` with the document open. 0 console errors.
- **Nit (f), taken.** One clause in V49: PDF chapters are by page only.
- **Nits (c), (d) and (e), left:**
  - (c) and (d): a note or a voice sample lights the Reader in the dock; a voice change during a sample re-reads it in the new voice. Both are edge cases.
  - (e): store tests need a driver mock harness. Left for later.
- **Gates after the fixes:** typecheck clean, tests 1084/1084, tripwire clean, lint only the old `store.ts:199`.

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only. One pass, bugs and edge cases only, verdict LGTM / LGTM with nits / FIX, sent to the
Builder. Your LGTM is not the user's approval.
Target: the uncommitted T57 diff on branch phase-6/speech-surfaces (files listed in
docs/handoff/2026-11-07-phase-6-speech-surfaces.md).
Check: the store's sleep timer (armSleep, finish clearing it, chapter pause in onSentence, seek
re-aiming), setVoice restarting mid-speech (generation, lock, paused state, startedAt); chapter
starts (md front matter, pdf outline resolution); island show/showKey; Media Session cleanup;
the window registry typing; dock `speech` liveness.
Context: SPEC V47, V49 (T57 amendment), the hand-off above.
```

### Builder prompt (Phase 6 exit)

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda (lean mode, one checkpoint,
no worktrees; rules in CLAUDE.md and docs/handoff/README.md).
Start from docs/handoff/LATEST.md → docs/handoff/2026-11-07-phase-6-speech-surfaces.md; verify
(git, tripwire, typecheck, tests). PR merged? Forged-check the merge range before pulling.
Next: T58, the Phase 6 exit. It needs the owner: a downloaded Piper voice, network off, a PDF
chapter, the scheduler log, a perf trace. Plan the run with the user first.
```
