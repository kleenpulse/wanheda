# Latest hand-off

**Newest:** [2026-11-06-phase-6-tts-spike.md](2026-11-06-phase-6-tts-spike.md). **Phase 6 (Voice) planned: V45–V50, T53–T59. T53, the TTS spike, is done: web Piper = raw onnxruntime-web 1.31.1 + `phonemizer` 1.2.1 (ADR-0012). Cold model load is about 2–3.7 s on every engine, so the voice is pre-warmed when a reader opens (owner). One thread, no COOP/COEP until the Phase 7 embed test. Docs + SPEC only; PR on `phase-6/tts-spike` after the Reviewer peer's LGTM. (PR #36, the Phase 5 exit, is merged at 78277c1; the previous LATEST.md still called it open.)** Next session: T54, speech core.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests). The Builder and Reviewer prompts are in the hand-off.
