# Latest hand-off

**Newest:** [2026-11-06-phase-5-pdf-viewer.md](2026-11-06-phase-5-pdf-viewer.md). **T47 built: PDFs open in Wanheda's own reader, a book with a real page curl by default, scroll one tap away; plus the user's mid-session additions (one-page book on desktop, marquee titles, pin with the liquid tank, auto-scroll, translucent auto-hiding bars). PR #31 merged (0705282). Follow-up PR `phase-5/reader-corner-guard`: the book no longer lifts a page corner when the pointer is over the paper menu, a bar or an arrow; Reviewer LGTM, awaiting merge.** Next session: the small renewal-cycle pin fix, then T48. T44 still waits for the first real Polar sale.

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

Read docs/handoff/2026-11-06-phase-5-pdf-viewer.md first and check that T47's PR is merged
(git log main). Branch phase-5/md-viewer off main. First, a small fix (user 2026-11-06):
Home's pinned billing cycle in components/money/renewal-cycle.tsx drops the pick when
localStorage refuses writes; move it onto the device-pref pattern
(components/reader/device-pref.ts, lifted to hooks/ if shared) or fix it in place. Then build T48 per SPEC §T and V40, V41:
the Markdown / text viewer with react-markdown 10.1.0 + remark-gfm 4.0.1 + rehype-sanitize
6.0.0 (already pinned) + rehype-slug 6.0.0; order sanitize → slug → Shiki (ids prefixed
`user-content-`; Shiki styles survive); shiki 4.5.0 fine-grained createHighlighterCore with the
JS regex engine (no Oniguruma WASM); a TOC; progress by heading anchor (`md:<heading-id>:<y‰>`).
Reuse the reader runtime and the PDF reader's stage, find and bar patterns where they fit.
Install only pinned versions (7-day cooldown; no bunx of unpinned tools).
```

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only. One pass, bugs and edge cases only, verdict LGTM / LGTM with nits / FIX, sent to the
Builder. Your LGTM is not the user's approval.
Target: the T48 diff on phase-5/md-viewer. Riskiest: sanitize order (sanitize before slug and
Shiki; no raw HTML, no MDX; `javascript:` links dropped; external links new tab + noopener),
Shiki output as the only dangerouslySetInnerHTML, heading-anchor locators resuming across
devices, V24 (no skeleton on a hop). Context: docs/handoff/2026-11-06-phase-5-pdf-viewer.md.
```
