# Hand-off — Phase 6: side task — reader prefs synced to the account

| | |
|---|---|
| Date | 2026-11-06 |
| Phase / checkpoint | Phase 6 — side task (user: "sync to db"), between T54 and T55 |
| Branch | `phase-6/reader-prefs-sync` (from `main` `54a7f0c`) |
| HEAD | the commit that adds this file |
| Previous hand-off | docs/handoff/2026-11-06-phase-6-speech-core.md (on `phase-6/speech-core`, separate PR) |

## State in one paragraph
Settings → Reader said "Saved on this device". All seven reader prefs (cover style, cover fit, book pages, page turn, text size, paper, auto-scroll speed) now also live in the owner's account, in `user_prefs.reader` (jsonb, nullable). Controls still read localStorage, so a change shows at once; the account copy rides in with the shell and is laid over the device's on load; a change saves the whole set 500 ms later. The section header shows the same live note as Appearance (Saving… / Saved / Couldn't save).

## Done this session
- `lib/reader/prefs.ts` (pure, client + server): lists, types, per-field parsers, `parseReaderPrefs` (valid fields only, missing ≠ default), `completeReaderPrefs` (whole set, no extra keys). Tests: `lib/reader/prefs.test.ts`.
- `hooks/device-pref.ts`: `get()` and `watch()` (fires on this tab's `set` only, never on another tab's storage event).
- `components/reader/prefs.ts`: all seven device prefs in one light module (+ `READER_DEVICE_PREFS`); `chrome.tsx` and `paper.tsx` re-export theirs, so the shell does not import the reader UI.
- `components/reader/reader-prefs-sync.tsx`: `ReaderPrefsSync` in `ShellFrame` under `PrefsProvider`. Owner: account copy applied once per load; fields the account lacks ⇒ device set saved up quietly. load-failed: device stands, changes still save. demo: device only.
- `actions/prefs.ts` `saveReaderPrefs` (requireOwner first), `lib/prefs/store.ts` `loadPrefs` returns `reader`, `saveReaderPrefs` upsert.
- `drizzle/0008_reader_prefs.sql`: `ALTER TABLE "user_prefs" ADD COLUMN "reader" jsonb;`
- SPEC V42 amended (reader prefs no longer "⊥ server").

## Verification (actual results, not intentions)
- `bun run typecheck`: pass
- `bun run test`: 92 files, 983 passed
- `bun run tripwire`: clean
- `bun run build` (empty DB env): pass
- ESLint on every touched file: clean
- Migration: applied to Neon 2026-11-06 with the user's go-ahead (`bun --env-file=.env.local run db:migrate`). Read-only check: `user_prefs.reader` jsonb nullable, `__drizzle_migrations` 9 rows, 1 prefs row, 0 with reader yet.
- Not run: a browser check in owner mode (save on one device, load on another).

## Known problems and risks
- Last write wins across devices; a change made on another device lands here on the next full load (same as Appearance).
- A save still pending when the shell unmounts is dropped (the next change saves the whole set).
- `LATEST.md` is left to the speech-core PR to avoid a conflict; it does not mention this PR.

## Next steps (in order)
1. Owner check: change a reader pref, reload on a second device or a private window, see it follow.
2. Back to Phase 6: T55 voices (see LATEST.md on `main` after speech-core merges).

## Review state
- Branch / PR: `phase-6/reader-prefs-sync` / opened with this commit
- Reviewer: not run (user asked for the PR directly)
