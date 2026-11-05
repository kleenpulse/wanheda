# Hand-off — Phase 2, checkpoint 3: notes board (T31)

| | |
|---|---|
| Date | 2026-11-05 |
| Phase / tasks | Phase 2, SPEC T31 (`~` until merged and run as owner); T30 still `~` (owner offline check not done yet, user chose to run it later) |
| Branch / PR | `phase-2/board`, built in `D:\Vxrcel\wanheda`; commit `98779df`, pushed and PR #12 opened 2026-11-05 on the user's go-ahead |
| Main | `167e302` — Merge pull request #11 (`phase-2/offline`) |
| Previous hand-off | docs/handoff/2026-11-05-phase-2-offline.md |

## State in one paragraph

Notes now have a board. `/notes?view=board` is a pannable, zoomable canvas ported from Shadow Garden's `infinite-canvas`: stickies drag and resize with the pointer or the keyboard, snap to a 24 px grid, and their place is saved like any other edit, through `api.update` and the outbox. Stickies carry their colour (a new data palette, never the signal), a pin, and checklist progress. A note can float as a mini window (`notes.note`) over any app, with a note picker inside. The Home "Quick note" widget is now "Pinned notes" and offers its old device-only text once as a real note. The palette gains "Open notes board". No migration: the `board_x|y|w|h` columns came with `0003_notes.sql`.

## What is in the change

- **Board place in the note, settled apart from the text** (SPEC V23, reworked after the Reviewer's FIX on PR #12): `NoteContent.board: BoardPlace | null` (`lib/notes/notes.ts`). A write carries `board` only when its place differs from the device's server copy; absent, the store keeps the note's place (this also covers ops queued before the board). A write that changes only the place is `place`: it sets `board_*` and nothing else, no version bump and no `edited_at`, so a move never enters a text conflict: a phone's offline text edit made before a desktop move still applies cleanly and keeps the move. Text conflicts are decided on text alone; the place follows the write if it carries one. `isBlank` (no title, body or tags) replaces the empty-content check, so a sticky started on the board or from the pinned widget and left without a word is dropped, never saved.
- **Board logic:** `lib/notes/board.ts`, pure and tested: snap and clamp, auto-layout for unplaced notes (oldest first, around placed ones, so a new note never shifts others), camera fit, centre place, nudges.
- **Canvas:** `components/notes/notes-board.tsx`. One mutable camera written to the DOM; the rAF loop only runs while something moves; wheel pans, Ctrl/⌘ + wheel and pinch zoom to the pointer; arrows/+/−/0 on the board; arrows move and Shift + arrows resize a focused sticky (one write per run of key presses); Enter opens, Esc steps back. The camera is per device; a saved view that shows no sticky (smaller screen) fits all instead.
- **Palette:** `--sticky-<colour>` fills and `--sticky-<colour>-mark` marks in `app/globals.css`. Light (Ember, Bench) and dark (Nebula, Bench) share marks; Bench has its own deeper fills (user, mid-session: "use darker colors on the bench skin"). Checked with the dataviz validator (all pairs: lightness band, chroma, CVD ΔE ≥ 8.7, normal-vision ΔE ≥ 18.5, ≥ 3:1 on every surface) and WCAG on every fill: ink ≥ 11.3:1, ink-2 ≥ 4.67:1 (Bench light ≥ 5.4:1, Bench dark ≥ 9.5:1). Colour is never the only cue: the menu names each one.
- **UI:** `components/notes/sticky.tsx` (maps, swatch, colour menu, progress); Notes view switch List | Board | Archive; editor beside the board at @4xl, drill-in below; `components/windows/note-window.tsx`; `components/widgets/pinned-notes-widget.tsx` (renamed from `note-widget.tsx`, id `home.note` kept because layouts store it); `WindowId` now includes module windows.
- **Fixed on the way:** "New note" from the Archive opened the new note with `?view=archive` (`open` used the view before the switch).
- **Review round (PR #12, 1 FIX + 5 nits, all fixed):** the FIX above; an unplaced sticky's cell is its rank among all live notes by creation, so placing one leaves a gap instead of reshuffling the younger ones; a click on the resize corner without movement saves nothing; a second finger mid-drag puts the sticky back before pinching; a board mounted hidden (deep link on a phone) picks its camera on its first real size and doesn't overwrite the saved view first; `api.hold(id)` replaces `discardIfEmpty`, so a blank note open in both the editor and the note window survives one of them letting go; moves no longer touch `edited_at` (the backwards-clock nit is moot).

## Verification (actual results)

- Typecheck clean; Vitest 33 files / 402 tests after the review round (17 new in this checkpoint, incl. the Reviewer's phone/desktop scenario); tripwire clean; ESLint clean on every touched file; zero-env `bun run build` passes.
- Review fixes in the browser (demo, dev): deep link `?view=board&n=…` on a 390 px phone, then Back → saved camera (40, 40) kept; resize-corner click without movement → no write; second touch mid-drag → sticky back at its start, no dragging flag; a blank note made in the note window and open in /notes → window's Back leaves it in the editor.
- Demo browser run (dev, Chrome): drag a sticky (528,0 → snapped 288,216, saved to the overlay), resize by the corner (→ 312×288), three Down + Shift+Right in one tick (→ +72 y, +24 w), click opens the editor beside the board; pinned widget on Home; palette "Open the note window" → picker → note; "Open notes board" listed; Ember light desktop; Bench dark and Bench light on a 390 px phone; computed tokens checked for all four skin × theme.
- **Not verified:** the owner path (a move landing in Neon and showing on a second device; a move made offline). T30's owner offline check is still open too.

## Next steps

1. User merges PR #12.
2. Owner checks after merge: **T30** (offline edit → chip "Offline · 1 waiting" → back online → second device). **T31**: on the board drag a sticky and resize one, reload on another device and see both; recolour one; pin one and see it on Home; open the note window from the palette and edit there.
3. Then T32, the Phase 2 exit.

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04):
build features; keep tripwire, forged-commit check and CI; one typecheck + test run before a
commit; no multi-round reviews or push/merge checks; commit, push and PRs only on the user's
word; a short hand-off + continuation prompt after every PR. No worktrees: branch off main in
D:\Vxrcel\wanheda itself. One checkpoint per session: after its PR merges, stop and hand over.

Phase 2 exit: T32. Read docs/handoff/2026-11-05-phase-2-board.md, SPEC.md §T (T30, T31, T32),
§V (V15, V17, V23) and the P2 CP1–CP3 lines in §I.

Start: `git fetch`; check new commits with `sh scripts/forged-commits.sh 167e302..origin/main`
before pulling; fast-forward main. Ask the user for the owner checks of T30 and T31 (next step 2
in the hand-off); mark each `x` when it passes. Then run T32 with the user (offline note → second
device ≤ 5 s after its next sync; a conflict keeps both versions; palette finds a body word) and
write the Phase 2 done hand-off with Phase 3 prompts.
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only (review the PR diff with gh / git show, never switch the Builder's branch). Lean mode
(user, 2026-11-04): review only when the user asks, one pass per PR, FIX-level findings only, no
push or merge checks. Your LGTM is not the user's approval. Context:
docs/handoff/2026-11-05-phase-2-board.md, SPEC.md §V (V15, V23). Look hardest at
lib/notes/notes.ts resolveWrite (place-only stale write ⇒ update) and isBlank, lib/notes/store.ts
saveNote (missing `board` keeps the row's place, per attempt), components/notes/notes-board.tsx
(pointer gestures, nudge accumulation between renders, camera restore) and the restorePending
change in components/notes/notes-provider.tsx.
```
