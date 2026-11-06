# Latest hand-off

**Newest:** [2026-11-06-phase-5-done.md](2026-11-06-phase-5-done.md). **T51 built, the Phase 5 exit: a cold 300-page PDF paints page 1 in 420 ms (1.5 s at 4× CPU) and scrolls 91 pages with no long task; keys and swipe turn both books; reduced motion swaps pages instantly. Two bugs found and fixed: B20 (an open from a stale library snapshot overwrote another device's newer place) and B21 (on main since T49: Markdown and text books could only turn forward, a page-flip bug). Reviewer peer LGTM with nits (nit taken); PR open on `phase-5/exit`, awaiting the user's merge. (PR #35 is merged: 060ba28.)** Next session: Phase 6 (Voice), planning first, then the TTS spike. Owner run still open (now including desktop → phone signed in). T44 still waits for the first real Polar sale.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests). The prompts below are copied from it.

### Builder prompt (Phase 6)

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04,
tightened 2026-11-05): build features; tests only where they guard real logic or a spec exit
case; keep tripwire, forged-commit check and CI; one typecheck + test run before a commit;
after the Reviewer peer's LGTM (or LGTM with nits) commit, push and open the PR without asking;
merge and db:migrate stay the user's. A short hand-off + continuation prompt after every PR.
No worktrees. One checkpoint per session. House goal (CLAUDE.md): native-app feel, V24.

Start from docs/handoff/LATEST.md and docs/handoff/2026-11-06-phase-5-done.md, then verify
against the repo (git, tripwire, typecheck, tests). Check the T51 PR is merged (git log main) and
check its incoming commits for forgeries before pulling. Phase 6 = Voice (FRD §Phase 6, §6.7,
D5). First plan it: draft the Phase 6 §T tasks and §V invariants with the spec skill (checkpoints
+ exit task: network off, a downloaded Piper voice reads a PDF chapter with no audible gaps; the
highlighted sentence matches the audio; first audio < 1.5 s; 60 fps while speaking). Then CP1 =
step 1, the spike (Eta): sherpa-onnx WASM vs @mintplex-labs/piper-tts-web vs raw onnxruntime-web
on this machine, measuring time to first audio, real-time factor and memory for a medium voice;
check the kokoro-js phonemizer licence; record the choice in an ADR. Every package: pinned exact,
published ≥ 7 days, supply-chain read before install (age, deps, install scripts, IOC regex);
never bunx an unpinned tool. The reader's input is text.json: readText(sha256, demo) in
components/reader/text.ts → TextFile { v, kind, sha256, sentences: { i, text, locator }[] }
(V44). PDF locators are pdf:<page>:<y‰> of the run a sentence starts in; Markdown and text
locators are estimates (md:<heading>:<y‰>, lines guessed at 70 chars), so find the exact
sentence on the open page by its text. Sentences are ≤ 1000 chars, not yet packed for TTS
(companion-tts transform.ts packs ~420 chars). Decide with the user whether reading aloud moves
the reader's saved place (V41, components/reader/resume.ts saves only owner moves).

Still open with the user, don't act on them unasked: the Phase 5 owner run (desktop → phone
signed in, a real md book on a second device, a real CJK PDF, text.json on a signed-in device),
eager remote images in the md book, pdf.js painting in a worker, T52.
```

### Reviewer prompt (T51)

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only. One pass, bugs and edge cases only, verdict LGTM / LGTM with nits / FIX, sent to the
Builder. Your LGTM is not the user's approval.
Target: the uncommitted T51 diff on branch phase-5/exit (Phase 5 exit). Riskiest: useResume
(components/reader/resume.ts): the owner-move gate (which events count; a restore or a view
remount must never save under a new clock), the open write keeping its place's clock
(openWrite, NO_PLACE_AT, openedAt through withProgress, the Dexie queue's put/settle by `at`, the
pending overlay and the server's greatest(last_opened_at)), following a newer place (echo of the
reader's own saves, remount by key, md vs pdf locators); fixBackTurn in flip-book.tsx (page-flip
internals, portrait and landscape, swipe); turnFor replacing both key maps.
Context: docs/handoff/2026-11-06-phase-5-done.md.
```
