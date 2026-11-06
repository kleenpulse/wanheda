# Latest hand-off

**Newest:** [2026-11-06-phase-5-reader-core.md](2026-11-06-phase-5-reader-core.md). **T46 (reader core, local-only) built, reviewed (LGTM with nits, nits 1–2 fixed) and in PR #30 for the user to merge.** `drizzle/0007_reader.sql` is generated and **not applied**: `bun run db:migrate` waits for the user's go-ahead, then an owner run (add a PDF, open it on a second device, relink, resume). Next: T47 `phase-5/pdf-viewer` in a fresh session after #30 merges. T44 is still deferred until the first real Polar sale.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests). The Builder and Reviewer prompts below are copied from it.

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
