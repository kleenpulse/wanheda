# Hand-off — Phase 2, checkpoint 2: offline notes (T30)

| | |
|---|---|
| Date | 2026-11-05 |
| Phase / tasks | Phase 2, SPEC T30 (`~` until merged and run as owner offline); T29 closed (`x`) after the owner check passed |
| Branch / PR | `phase-2/offline`, built in `D:\Vxrcel\wanheda`; pushed and PR opened 2026-11-05 on the user's go-ahead |
| Main | `bb929c8` — Merge pull request #10 (`phase-2/notes-core`) |
| Previous hand-off | docs/handoff/2026-11-05-phase-2-notes-core.md |

## State in one paragraph

Notes now work without a connection. Every note write goes into an IndexedDB outbox (Dexie) first, then to the server in order, one at a time, when the device is online: on a new write, on focus, on reconnect and every 30 s. An op leaves the queue only when the server answers, so a closed tab or a dropped connection loses nothing. Tabs share the queue: one sends at a time (Web Lock) and the others hear the result (BroadcastChannel). The list refreshes on focus, reconnect and every 30 s, and the last server list is kept on the device for when the server can't be reached. A conflict shows a toast and the editor banner. The editor has a History panel, where restoring a version is a new write that puts the current version into history first (`keepCurrent`). A sync chip by the page title shows "Offline · N waiting" or "Syncing N". This PR also fixes all ten Reviewer findings on PR #10 (SPEC B5–B8), on the user's call. No migration.

## What is in the PR

- **Outbox:** `lib/notes/outbox.ts` (`Outbox`, `LocalNotesStore`, `MemoryNotesStore` for demo and tests, `supersedes`, `merged`), `lib/notes/local-store.ts` (Dexie db `wanheda-notes` v1: outbox, landed versions, notes snapshot, meta; every queue step is one transaction). `NoteSender` is gone from `lib/notes/sync.ts`.
- **Queue rules (V23, amended):** a newer save replaces an older queued save of the same note only if that one was never sent and isn't in flight. A tried op is resent first, so a lost reply can't turn into a conflict with your own edit. A delete waits behind the note's earlier writes. A write made before this device's last landing is sent on that version, but not after a lost conflict.
- **Server:** `store.ts` `replaceKeepingHistory` (locks the row `FOR UPDATE`, copies it to history, updates it, all in one batch; used by conflict-wins and restore), `listRevisions`, `deleteNote` → true|false|null; search ranks against an OR tsquery but still matches on AND. `actions/notes.ts`: a delete with nothing to delete is done, not failed; `keepCurrent` passes through. New route `GET /api/notes/[id]/revisions`.
- **Client:** `NotesProvider` rewritten as a runtime with `start()` (boot from the device, listeners, ticks, channel); `useNotesSync`, `useNoteHistory`; `components/ui/toaster.tsx` (mounted in ShellFrame); `components/shell/sync-chip.tsx` (in PageFrame); editor History panel and a "queued" status label.
- **Review fixes:** checklists come from the remark + GFM tree (`taskItems`, `toggleTaskAt(body, offset)`); task boxes get `aria-labelledby` their own text; the body textarea has `maxLength`; the tag input ignores Enter during IME composition; the palette search no longer fetches the whole list for the owner; the best note row keeps the palette highlight until the owner moves it.
- **Deps** (pinned, ≥ 7 days): `dexie` 4.4.7; `unified` 11.0.5, `remark-parse` 11.0.0, `@types/mdast` 4.0.4 (already in the tree through react-markdown; now direct).

## Verification (actual results)

- Typecheck clean; Vitest 32 files / 385 tests; tripwire clean; ESLint clean on every touched file; zero-env `bun run build` passes (route list includes `/api/notes/[id]/revisions`).
- Neon, read-only on literals: for words 150 positions apart, `ts_rank` on the AND query = 1e-16 (under the 0.001 floor), on the OR query = 0.061. A `SELECT … FOR UPDATE` + `UPDATE` transaction on a missing id ran and touched 0 rows.
- Demo browser run (Chrome, production build, port 3207): ticking a checklist item by offset (2 of 4 done, status "Demo: kept in this tab only"); History panel shows its demo message; palette capture "note offline capture check" saves on Enter; boxes are named by their task text; no console errors.
- **Not verified:** the owner path in a browser (offline edit → chip → reconnect → second device; a conflict toast; a restore from History).
- **Known limit:** there is no service worker, so a fresh load while offline fails. A tab that is already open keeps working offline, and so does a down server.

## Next steps

1. User merges the PR.
2. Owner check (closes T30): open a note, DevTools → Network → Offline, edit it, and check the chip reads "Offline · 1 waiting"; go back online and check the chip clears and a second device shows the edit within about 5 s of its next refresh. Optional: make a conflict (edit the same note on two devices while one is offline) and check the toast, then open History and restore the other version; the version it replaced should appear in History.
3. T31 `phase-2/board`.

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04):
build features; keep tripwire, forged-commit check and CI; one typecheck + test run before a
commit; no multi-round reviews or push/merge checks; commit, push and PRs only on the user's
word; a short hand-off + continuation prompt after every PR. No worktrees: branch off main in
D:\Vxrcel\wanheda itself. One checkpoint per session: after its PR merges, stop and hand over.

Phase 2, checkpoint 3: T31 `phase-2/board`. Read docs/handoff/2026-11-05-phase-2-offline.md,
SPEC.md §T (T30, T31), §V (V15, V17, V23), the P2 CP1 and CP2 lines in §I, and ADR-0008.

Start: `git fetch`; check new commits with `sh scripts/forged-commits.sh bb929c8..origin/main`
before pulling; fast-forward main. Ask the user for the owner check of T30 (next step 2 in the
hand-off); when it passes, mark T30 `x`. Then `git switch -c phase-2/board` off main and build
T31. Board moves and resizes go through the outbox (`api.update`); the board columns already
exist, so no migration is planned. If one turns out to be needed, generate and show the SQL and
apply only on the user's go-ahead with `bun --env-file=.env.local run db:migrate`.
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only (review the PR diff with gh / git show, never switch the Builder's branch). Lean mode
(user, 2026-11-04): review only when the user asks, one pass per PR, FIX-level findings only, no
push or merge checks. Your LGTM is not the user's approval. Context:
docs/handoff/2026-11-05-phase-2-offline.md, SPEC.md §V (V7, V9, V17, V23) and §B (B5–B8). Look
hardest at lib/notes/outbox.ts #drain (rebase on the landed version, hold on failure) and
supersedes, lib/notes/local-store.ts (each step one transaction across tabs),
components/notes/notes-provider.tsx applyEvent (overlay drop vs rebase, deleted-here skip) and
lib/notes/store.ts replaceKeepingHistory.
```
