# Latest hand-off

**Newest:** [2026-11-06-phase-6-speech-core.md](2026-11-06-phase-6-speech-core.md). **Phase 6 CP2, T54, is done: `lib/speech/`. It has the Piper engine (onnxruntime-web 1.31.1 + phonemizer 1.2.1 in a Worker, same-origin assets) and the Web Speech fallback. A gapless queue cuts ramping units and schedules them on one AudioContext clock, prefetching by queued seconds. One speech store per tab drives it, holding a Web Lock so only one tab per device speaks. Voices come from a pinned catalog into OPFS, and the voice pre-warms once a reader has opened. No speech UI yet (T56, T57). PR on `phase-6/speech-core` after the Reviewer peer's LGTM.** Next session: T55, the voices.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests). The Builder and Reviewer prompts are in the hand-off.
