# Latest hand-off

**Newest:** [2026-11-07-phase-6-speech-surfaces.md](2026-11-07-phase-6-speech-surfaces.md). **Phase 6 CP5, T57, is done: Reviewer LGTM with nits (pass 2), committed on `phase-6/speech-surfaces` and merged by PR. Forged-check the merge range before pulling `main`.**

- The island has a `speech` card, and the new `reader.speech` mini window has the same controls: prev, play/pause, next, stop, plus chips for speed, voice and sleep.
- The sleep timer runs 15–60 minutes or to the end of the chapter, and pauses when it fires.
- The Media Session carries the title and the media keys.
- Gates: typecheck clean, 1084/1084 tests, tripwire clean, build passes.

Next: T58, the Phase 6 exit, which needs the owner's machine.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests). The Builder and Reviewer prompts are in the hand-off.
