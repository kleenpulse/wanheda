# Hand-off: password-protected PDFs (T67)

| | |
|---|---|
| Date | 2026-11-07 |
| Phase / checkpoint | P5 follow-up between Phase 7 checkpoints, T67 `fix/pdf-password` |
| Branch | `fix/pdf-password` (off `main` at `29a4f5c`) |
| HEAD | `29a4f5c`, Merge pull request #49 (the work is uncommitted on top) |
| Previous hand-off | docs/handoff/2026-11-07-phase-7-music-library.md |

## State in one paragraph

T63 is merged as PR #49 (`29a4f5c`). The Reviewer's post-merge check came back VERIFIED.

Password-protected PDFs are built and checked in the browser. The user asked for them through `wanheda-c2`, whose plan was followed. They are ready for review.

Queued next, from the user via `wanheda-c2`:
1. `fix/music-list-height`. The music list fills the height under its tabs and scrolls on its own, so the page gets no second scrollbar. c2 sent the diagnosis and a has()-based page-fill plan.
2. Then T64 `phase-7/music-player`.

## Done this session

- **Open path:**
  - `pdfParams(file, onFail, password?)` passes `password` only when there is one.
  - `openPdf(sha, file, password?)`. A failed open already lets go of the held document, so a retry loads fresh.
- **Text job:**
  - The `extract` request carries `password?`.
  - The worker answers `{ ok: false, locked: true }` on a PasswordException.
  - `ensureText` looks up the password, and does not settle a locked failure. Before this, a locked PDF's read-aloud stayed dead until a reload.
  - After an unlock, the reader starts `ensureText` again.
- **Pure core** `lib/reader/pdf-password.ts`:
  - `openFailure`: code 1 means a password is needed, code 2 means it was wrong, anything else is broken.
  - `PdfPasswords`: this tab's memory first, then the device. "Not remembered" also deletes any copy on the device.
- **Device store** `components/reader/pdf-passwords.ts`:
  - Its own Dexie DB, `wanheda-reader-keys.pdfPasswords`, so the reader store's schema doesn't change. Demo is memory only.
  - `forgetPdfPassword` is called on delete only, not through `onForget`, which also fires on a broken read. A broken read keeps the password for the relink.
- **UI** in `pdf-reader.tsx`:
  - `failed` is now `"broken" | "locked"`.
  - The lock form: LockKeyhole icon, "This PDF is locked", password field with show/hide, "Remember on this device" ticked by default, Unlock.
  - A wrong password: the field is read-only while trying, so it keeps focus; then it is selected, and "That password didn't work." is announced with aria-live.
  - A kept password that fails with code 2 is dropped and the form asks. It never loops.
  - The broken message is now "This PDF can't be opened. It may be damaged."
- **CHANGELOG:** 1 line. **SPEC:** V40a and the T67 row.

## Verification (actual results)

- Tripwire clean, typecheck clean, 1241/1241 tests, production build passes. ESLint: 0 errors in the new code; the 2 errors in `text.worker.ts:57` and `hash.worker.ts:46` are already on main.
- **A real encrypted PDF in tests:** RC4 40-bit, standard handler R2, built at test time with no committed fixture. Through pdf.js: no password gives code 1, "nope" gives code 2, "test" gives the page text.
- **Browser** (demo mode, production build on :3043, Chrome):
  - The locked PDF shows the form, focused, with Remember ticked.
  - "nope" gives "That password didn't work.", with the field focused and fully selected and aria-invalid set.
  - "test" opens it. The header shows "1 PAGE", backfilled after the unlock, and find "balance" highlights on page 1.
  - Opening a second locked PDF releases the first. Reopening the first uses the kept password, and polling every 16 ms never caught the form.
  - No console errors.
- **Not driven:** the owner's Dexie "remember" across a reload. Demo files live in the tab only, so the device path is unit-tested only.

## Decisions made

- **A separate Dexie DB rather than a version bump of `wanheda-reader`.** `openReaderStore` declares that DB's schema, so a second declarer would conflict.
- **Delete-only forgetting** (see above).
- **No `locked` flag on `pdfFactsOfFile`.** A locked add already gives `pages: null` and no cover. The reader backfills both after the unlock through `setPages` and the page-one cover effect.

## Known problems and risks

- **A document deleted on another device leaves its password on this one.** It is keyed by sha256, so nothing uses it, but it is a stored secret with no document. This is the Reviewer's optional nit, deferred. Prune rows whose sha256 isn't in the library, and only against a fresh server library, never the offline snapshot, which could lack a just-added document.

## Next steps (in order)

1. Reviewer pass (`wanheda-2a`).
2. On LGTM: commit, push, open the PR, Reviewer tip check, merge (the owner's word this session).
3. `fix/music-list-height` (c2's plan).
4. T64 `phase-7/music-player`.

## Files to stage (by name)

- `CHANGELOG.md`, `SPEC.md`
- `components/reader/pdf/{engine,source,source.test}.ts`, `components/reader/pdf/pdf-reader.tsx`
- `components/reader/{text,text.test,text.worker,use-reader,pdf-passwords}.ts`
- `lib/reader/{device-protocol,pdf-password,pdf-password.test}.ts`
- `docs/handoff/2026-11-07-pdf-password.md`, `docs/handoff/LATEST.md`

## Env / services touched

- No database writes, no migrations.
- The demo server on :3043 is stopped.
- The fixture generator is in the scratchpad `pdfpw/`.
