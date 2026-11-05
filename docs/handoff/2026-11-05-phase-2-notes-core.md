# Hand-off — Phase 2, checkpoint 1: notes core (T29)

| | |
|---|---|
| Date | 2026-11-05 |
| Phase / tasks | Phase 2, SPEC T29 (`~` until merged and run as owner) |
| Branch / PR | `phase-2/notes-core`, built in `D:\Vxrcel\wanheda`; pushed and PR opened 2026-11-05 on the user's go-ahead |
| Main | `50e3e9e` — Merge pull request #9 (`phase-1/exit`) |
| Previous hand-off | docs/handoff/2026-11-05-phase-1-done.md (in this same PR) |

## State in one paragraph

Notes exist: a `/notes` app with a list and a Markdown editor (checklists tick in Read mode), quick capture from the palette ("note buy SSD" + Enter), full-text search of note bodies from the palette on any page, and "New note". Writes follow V23 (client UUIDs, version + edit time, the loser kept in `note_revision`). The migration `drizzle/0003_notes.sql` was applied to Neon on the user's go-ahead. Everything was verified in demo mode; the owner path (real saves, real search) has not been run in a browser yet.

## What is in the PR

- **Data:** `note` + `note_revision` (`lib/db/schema/notes.ts`), one migration for all of Phase 2 (board, reminder and generated `search` tsvector columns included).
- **Logic:** `lib/notes/notes.ts` (pure: validation, `resolveWrite`, checklists, titles, capture, prefix tsquery, local search), `lib/notes/store.ts` (V23 save loop, conditional on the version read; incoming-wins in one `db.batch`), `lib/notes/sync.ts` (overlay merge, `NoteSender`), `lib/notes/server.ts`, `lib/notes/seed.ts`.
- **Server:** `actions/notes.ts` (save, delete); reads are route handlers `GET /api/notes` and `GET /api/notes/search` (server actions queue one at a time, so search would wait behind saves).
- **Client:** `QueryProvider` + `NotesProvider` in `ShellFrame`; `/notes` page prefetches with `qc.query` and hydrates; `NotesApp`, `NoteEditor`, `NoteMarkdown`; `.note-md` / `.note-check` CSS; palette Capture and Notes groups.
- **Deps** (pinned, ≥ 7 days): `@tanstack/react-query` 5.105.0, `react-markdown` 10.1.0, `remark-gfm` 4.0.1, `rehype-sanitize` 6.0.0.
- **Palette fixes found while testing:** cmdk's empty state showed beside force-mounted rows; a long note snippet squeezed the title; fuzzy matches took the highlight from the note hit (the palette's selected value is now controlled).

## Verification (actual results)

- Typecheck clean; Vitest 31 files / 378 tests; tripwire clean; ESLint clean on every touched file; zero-env `bun run build` passes.
- Demo browser run (Chrome, production build, port 3205): list and editor side by side at 1440 px; checklist tick changes the right line and the card's count; quick capture saves on Enter; search "pragm" from Settings → Enter opens the Reading list; Ember phone at 400 px drills in and back; no console errors or warnings.
- Neon: migration applied; read-only check shows both tables, 5 indexes, RLS on.
- **Not verified:** owner mode in a browser (a save, a search, a conflict between two tabs).

## Next steps

1. User merges the PR.
2. Owner check (closes T29): sign in, open `/notes`, create a note, reload, search a body word from the palette. Optional conflict check: open the same note in two browsers, go offline in one, edit both, reconnect; the banner should say which version won and `note_revision` should hold the other.
3. T30 `phase-2/offline`: the Dexie outbox replaces the in-memory `NoteSender` queue (same interface), plus a local cache, pull on focus/online/30 s, history view and offline chip.

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04):
build features; keep tripwire, forged-commit check and CI; one typecheck + test run before a
commit; no multi-round reviews or push/merge checks; commit, push and PRs only on the user's
word; a short hand-off + continuation prompt after every PR. No worktrees: branch off main in
D:\Vxrcel\wanheda itself. One checkpoint per session: after its PR merges, stop and hand over.

Phase 2, checkpoint 2: T30 `phase-2/offline`. Read docs/handoff/2026-11-05-phase-2-notes-core.md,
SPEC.md §T (T29, T30), §V (V23) and the P2 CP1 lines in §I, and ADR-0008.

Start: `git fetch`; check new commits with `sh scripts/forged-commits.sh 50e3e9e..origin/main`
before pulling; fast-forward main. Ask the user for the owner check of T29 (next step 2 in the
hand-off); when it passes, mark T29 `x`. Then `git switch -c phase-2/offline` off main and build
T30. No migration is planned for T30; if one turns out to be needed, generate and show the SQL
and apply only on the user's go-ahead with `bun --env-file=.env.local run db:migrate`.
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only (review the PR diff with gh / git show, never switch the Builder's branch). Lean mode
(user, 2026-11-04): review only when the user asks, one pass per PR, FIX-level findings only, no
push or merge checks. Your LGTM is not the user's approval. Context:
docs/handoff/2026-11-05-phase-2-notes-core.md, SPEC.md §V (V7, V9, V17, V23). Look hardest at
lib/notes/store.ts saveNote (the version-conditional steps and the batch) and at
lib/notes/sync.ts NoteSender (rebasing a waiting write only after its predecessor landed).
```
