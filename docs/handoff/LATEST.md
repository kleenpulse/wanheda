# Latest hand-off

**Newest:** [2026-11-07-phase-6-done.md](2026-11-07-phase-6-done.md). **Phase 6 exit (T58) passed on the owner's run. Review: LGTM with nits, then two FIXes, resolved; final LGTM. Committed on `phase-6/exit`, PR open; the merge is the user's.**

- Offline Piper read a whole chapter of a 14,038-page PDF: max gap 0 ms, 0 underruns, highlight within 60 ms, 60 fps.
- First audio from the press is 1212–1298 ms with the worker idle (V50 passes). A shorter first unit was tried and reverted: it gapped on throttled tabs.
- The run found two bugs, both fixed:
  - **B22:** a one-page book taller than the stage now follows the voice down the page.
  - **B23:** play no longer parses the 19 MB text.json at the press.
- New: an opt-in exit log (localStorage `wanheda:speech-log` = "1").
- Gates: typecheck clean, 1101/1101 tests, tripwire clean, build passes.

Next: the user merges the PR. After that, Phase 7 (Media) starts in a new session.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests). The Reviewer prompt and the Phase 7 Builder prompt are in the hand-off.
