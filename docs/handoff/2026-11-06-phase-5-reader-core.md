# Hand-off — Phase 5 CP1: reader core (T46)

| | |
|---|---|
| Date | 2026-11-06 |
| Phase / checkpoint | Phase 5 CP1, T46 built. Next: T47 (PDF viewer) |
| Branch | `phase-5/reader-core` (SPEC draft commit + T46 commit) |
| Previous hand-off | docs/handoff/2026-11-06-phase-5-start.md |
| Open PR | T46 PR (see LATEST.md for the number). The user merges |
| Migration | `drizzle/0007_reader.sql` generated and read, **not applied**. `bun run db:migrate` waits for the user's go-ahead |

## State in one paragraph

The reader core is in: schema and SQL for `document`, `collection`, `document_collection`, `reading_progress` and `highlight`; a hash worker that works out a file's sha256 and keeps its bytes in this device's OPFS in one pass; the `/reader` library (generated covers, search, collection and tag filters, progress, last opened, drop zone, edit dialog, undoable deletes); a "not on this device" relink by sha256; reading positions with newer-wins on the server, a device queue and a sendBeacon on page hide; a stopgap viewer at `/reader?d=` (Markdown and text real, PDF in the browser's own viewer until T47); demo seed docs; Home "Continue reading"; palette "Continue <title>". Capability `files` (R2) exists and is off. Nothing uploads file bytes anywhere.

## Decisions (Builder, recorded for review)

- **Presign route, `confirmUpload` and `aws4fetch` wait for R2.** The capability and env vars are built and off. Without a bucket the route can't be tested, and installing an unused dependency adds risk for nothing. The schema already has `r2_key`, so R2 needs no migration.
- **Covers are generated** (title, kind, a tint picked by the hash). Real page-one covers need pdf.js, which arrives with T47; pulling it forward would mean wiring its worker twice.
- **Stopgap viewer** at `/reader?d=<id>` so open → progress → Continue reading works end to end now. T47 replaces the PDF part; T48 replaces the Markdown part (slugs, Shiki, TOC).
- **Progress goes through `POST /api/reader/progress`**, not a server action, so a closing page can send it with sendBeacon. Body is text/plain (some browsers refuse a JSON beacon), cross-site senders get 403.
- **Composite `(id, user_id)` foreign keys** on every child table, so a link between two users' rows can't exist even if a store check were wrong.
- A file that can't be kept on the device (private window, quota) still joins the library, with a toast.

## Verification

- `bun run typecheck` clean. `bun run test`: 85 files, 900 tests (+ reader 15, store 9, queue 2, capabilities 3). `bun run tripwire` clean. ESLint clean on touched files (one pre-existing error in `components/widgets/weather-widget.tsx`, not touched).
- Zero-env `bun run build`: `/reader` partial prerender, both API routes dynamic.
- Demo browser run (zero-env production build on port 3043, because the user's dev server held port 3000 for this folder; it was left alone): library in Nebula and Ember, desktop and 400 px; Markdown resume exact (y 2885 of 5769 after leaving and coming back); wrong file on relink refused with "Add it instead"; PDF opens; hop to Home 145 ms with the widget from cache; palette shows "Continue …"; no console errors.
- **Not run:** owner mode (OPFS writes, Neon, a second device relinking). It needs the migration.
- Review (wanheda-2a): **LGTM with nits**, no FIXes. Nit 1 fixed: `?d=` is read with `hooks/use-url-param.ts` (new `pushUrl`), so no Suspense sits in front of the reader's first paint; checked in the browser (cold load of `?d=`, Library button, browser Back stays a soft navigation, Home widget → document). Nit 2 fixed: the progress route refuses a declared `content-length` over 4 KB before reading. Nit 3 is open item 4.

## Open items

1. User: `bun run db:migrate` for 0007, then an owner run: add a PDF, close, open on a phone (entry says "not on this device"), pick the same file, check it resumes.
2. OPFS files whose document was deleted on another device stay on this device until removed here. A sweep against the library is cheap to add later.
3. T47 brings pdf.js: page locators, real covers (`<sha>.cover.webp` in OPFS), and replaces the iframe.
4. V41 trusts client clocks (review nit 3). A device whose clock runs a few minutes behind has its newer positions refused as stale until it passes the other device's `at`; the +5 min clamp only stops clocks running ahead. If it bites: stamp with the server's time when the gap passes a threshold, or carry a per-device sequence.

## Next steps

1. Fresh session: T47 `phase-5/pdf-viewer` from main after the T46 PR merges.

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04,
tightened 2026-11-05): build features; tests only where they guard real logic or a spec exit
case; keep tripwire, forged-commit check and CI; one typecheck + test run before a commit;
after the Reviewer peer's LGTM (or LGTM with nits) commit, push and open the PR without asking
(user 2026-11-05); merge and db:migrate stay the user's. A short hand-off + continuation prompt
after every PR. No worktrees. One checkpoint per session. House goal (CLAUDE.md): native-app
feel, V24.

Read docs/handoff/2026-11-06-phase-5-reader-core.md first. Check the T46 PR is merged and
whether 0007 is applied (ask the user; never migrate yourself). Branch phase-5/pdf-viewer off
main. Build T47 per SPEC §T and V40, V41, V43: react-pdf 11.0.0 + pdfjs-dist 6.3.289 exact
(7-day cooldown; no bunx of unpinned tools), viewer client-only, worker via new URL(...,
import.meta.url) never copied to public/ (no tracked .mjs), isEvalSupported false; virtual
pages, text layer, find, outline, thumbnails, zoom; progress `pdf:<page>:<y‰>` through the
existing reader runtime; replace the iframe stopgap in components/reader/document-view.tsx;
page-one covers as webp in OPFS (`<sha>.cover.webp`).
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only. One pass, bugs and edge cases only, verdict LGTM / LGTM with nits / FIX, sent to the
Builder. Your LGTM is not the user's approval.
Target: the T47 diff on phase-5/pdf-viewer. Riskiest: pdf.js hardening (isEvalSupported false,
same-origin worker, no tracked .mjs), react-pdf and pdfjs-dist versions matching exactly,
memory (pages rendered only in view ± 2, canvases freed), progress locators and resume,
V24 (no skeleton on a hop). Context: docs/handoff/2026-11-06-phase-5-reader-core.md.
```
