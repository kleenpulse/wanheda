# Latest hand-off

**Newest:** [2026-11-06-phase-6-voices.md](2026-11-06-phase-6-voices.md). **Phase 6 CP3, T55, is done (Reviewer: LGTM with nits, all taken).** Settings → Voices manages a pinned catalog of 14 English Piper voices. It has filters, sizes, MODEL_CARD licences (non-commercial flagged, base voices included), and downloads with progress and cancel that are checked by size and sha256. Delete goes through an Undo toast. The default voice and speed are device prefs, and the island has a `transfer` activity. The worker now phonemizes with each voice's own espeak voice. PR on `phase-6/voices`. Next session: T56, the read-along.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests). The Builder and Reviewer prompts are in the hand-off.
