# Latest hand-off

**Newest:** [2026-11-06-phase-5-md-viewer.md](2026-11-06-phase-5-md-viewer.md). **T48 built: Markdown and text open in Wanheda's own reader (a sheet of paper on the PDF stage, contents, find, Shiki code colours with no WASM, place kept by heading). Plus: shared reader chrome, wheel-adjustable auto-scroll speed, scroll fades on plain scrollers app-wide, Home's billing-cycle pin kept in private windows. PR #33 open, Reviewer LGTM after one FIX round, awaiting merge. (PR #31 and #32 are both merged: 0705282, b5b664b.)** Next session: T49 (Markdown and text as a paged book, plus pdf.js CMaps and standard fonts, and a `pages` count). T44 still waits for the first real Polar sale.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests). The Builder and Reviewer prompts below are copied from it.

### Builder prompt

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04,
tightened 2026-11-05): build features; tests only where they guard real logic or a spec exit
case; keep tripwire, forged-commit check and CI; one typecheck + test run before a commit;
after the Reviewer peer's LGTM (or LGTM with nits) commit, push and open the PR without asking;
merge and db:migrate stay the user's. A short hand-off + continuation prompt after every PR.
No worktrees. One checkpoint per session. House goal (CLAUDE.md): native-app feel, V24.

Start from docs/handoff/LATEST.md and docs/handoff/2026-11-06-phase-5-md-viewer.md, then
verify against the repo (git, tripwire, typecheck, tests). Check PR #33 (T48) is merged
(git log main). Branch phase-5/<slug> off main for T49 per SPEC §T: Markdown and text as a
paged book (V42), reusing components/reader/chrome.tsx and the md reader's place
(`md:<heading>:<y‰>`), plus the T47 polish (pdf.js CMaps and standard fonts served
same-origin; a `pages` count on the document). Install only pinned versions (7-day cooldown;
no bunx of unpinned tools).
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only. One pass, bugs and edge cases only, verdict LGTM / LGTM with nits / FIX, sent to the
Builder. Your LGTM is not the user's approval.
Target: the T49 diff. Riskiest: the md place surviving the switch between scroll and book,
pagination on width and text-size changes, CMaps and fonts served same-origin only (V40),
V24 (no skeleton on a hop). Context: docs/handoff/2026-11-06-phase-5-md-viewer.md.
```
