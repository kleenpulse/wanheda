# Hand-off — Phase 5 start: Reader SPEC draft (before T46)

| | |
|---|---|
| Date | 2026-11-06 |
| Phase / checkpoint | Phase 4 closed except T44 (deferred). Phase 5 SPEC draft written and decided; T46 not started |
| Branch | `phase-5/reader-core` (off main `993413b`), one local commit holding the SPEC draft and this hand-off. Not pushed |
| Previous hand-off | docs/handoff/2026-11-06-phase-4-net-goals.md |
| Open PR | #29 `style/bench-darker`: the user's `app/globals.css` (darker Bench, no grid). The user merges |

## State in one paragraph

PRs #27 (T42) and #28 (T43) are merged. **T44 is deferred** (user, 2026-11-06). The Polar token works: production, organization found, 2 products seen (MotionGarden Pro Membership and Lifetime). But the organization has no sales yet: 0 subscriptions, orders and refunds. Its products are not mapped, and its only sync ran on T40 code, before T41 merged. T44 gets ticked on the first real sale: map both products to Motion Garden, Sync now, then compare the parity card with Polar's dashboard. The user chose to move on to Phase 5 (Reader). The SPEC draft (V38–V44, T46–T52) is written and the open questions are decided.

## Decisions (user, 2026-11-06)

- **Local-only first, no R2 yet.** R2 is free up to 10 GB, but Cloudflare needs a card on file to turn it on.
  - File bytes live in each device's OPFS. The `document` row (metadata, sha256, `r2_key` null) lives in Neon, so the library, progress and mode sync.
  - On another device the entry shows "not on this device". Opening the same file there matches the sha256, relinks and resumes.
  - Capability `files` (R2 env) gets built but stays off. Adding R2 later needs no rework.
- **`highlight` table goes into migration 0007 now**, to avoid a second migration. Builder's pick, recorded as decided.
- **Sentences for Phase 6** (`text.json`) stay on the device until R2 is on.
- **Library picks** (Zeta recon, `bunfig.toml` 7-day cutoff = published on or before 2026-10-30):
  - `react-pdf` 11.0.0 + `pdfjs-dist` 6.3.289 exact (react-pdf's own pin). The viewer is client-only; the worker comes in via `new URL(…, import.meta.url)` and is never copied to `public/` (a tracked `.mjs` trips the tripwire).
  - Search is built on `getTextContent` (escape the text) or pdfjs `PDFFindController`.
  - Markdown: `react-markdown` 10.1.0, `remark-gfm` 4.0.1 and `rehype-sanitize` 6.0.0 are already pinned. Add `rehype-slug` 6.0.0, and `shiki` 4.5.0 in its fine-grained form with the JS regex engine, highlighted on the server. Plugin order: sanitize → slug → Shiki.
  - Page flip: a CSS 3D flip with no package. Fallback `page-flip` 2.0.7. Never `react-pageflip`.
  - R2 later: `aws4fetch` 1.0.20.
  - EPUB later: foliate-js as a git dependency pinned to a hand-reviewed commit, never the npm package.
- Side note (Zeta): Next 16 Cache Components keep hidden routes in `<Activity>`. That likely explains why Home widgets keep a stale privacy mask (T42 open item 2).

## Verification

SPEC changes only. Nothing to build or test in this step.

## Next steps (in order)

1. A fresh session builds **T46 `phase-5/reader-core`** on this branch. It starts from the local commit; check `git log` first.
2. The schema SQL (`drizzle/0007`) is reviewed, and `db:migrate` waits for the user's go-ahead.
3. The Reviewer pass, then commit, push and the PR. The user merges.

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04,
tightened 2026-11-05): build features; tests only where they guard real logic or a spec exit
case; keep tripwire, forged-commit check and CI; one typecheck + test run before a commit;
after the Reviewer peer's LGTM (or LGTM with nits) commit, push and open the PR without asking
(user 2026-11-05); merge and db:migrate stay the user's. A short hand-off + continuation prompt
after every PR. No worktrees. One checkpoint per session. House goal (CLAUDE.md): native-app
feel, V24.

Read docs/handoff/2026-11-06-phase-5-start.md first. You are on branch phase-5/reader-core
(one local commit: the Phase 5 SPEC draft). Build T46 per SPEC §T and V38, V39, V41:
local-only reader core (files in OPFS, document rows in Neon), schema + reviewed SQL
drizzle/0007 (document, collection, document_collection, reading_progress, highlight;
db:migrate only on the user's go-ahead), sha256 hash worker, /reader library app (manifest,
rail, palette; covers, tags, collections, progress %, last opened; open a local file;
"not on this device" relink by sha256), demo seed docs, Home "Continue reading" widget.
Install only the pinned versions in the hand-off (7-day cooldown; no bunx of unpinned tools;
no tracked .js/.mjs). Leave app/globals.css alone (PR #29 holds it).
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only. One pass, bugs and edge cases only, verdict LGTM / LGTM with nits / FIX, sent to the
Builder. Your LGTM is not the user's approval.
Target: the T46 diff on phase-5/reader-core. Riskiest: drizzle/0007 (RLS, uniques, cascades,
user scoping); sha256 identity and relink on another device; nothing about file bytes reaching
the server in local-only mode; reading_progress newer-wins by client `at` (V41); OPFS failure
paths (quota, private mode); V24 (no page skeleton on a hop); demo never touching the DB.
Context: docs/handoff/2026-11-06-phase-5-start.md.
```
