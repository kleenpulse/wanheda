# Latest hand-off

**Newest:** [2026-11-07-phase-7-video.md](2026-11-07-phase-7-video.md). **T61 merged (#47, `5014b01`, post-merge VERIFIED). T62 video on `phase-7/video`: LGTM with nits (all taken); PR next.**

- Resume and watched (device first, server by fetch and beacon, newest wins); Continue and Watch later lists.
- Theatre (`t`), SRT/VTT sidecar subtitles, palette player commands with the skin's keys.
- One Media Session arbiter for speech and video: the last started owns the keys, and starting one pauses the other.
- Migrations 0009 and 0010 are written but **not applied**: the owner runs `bun run db:migrate`.
- The merged remote branch `phase-7/media-core` is still there (deletion denied in auto mode): the owner's to delete.

Next: commit, push, PR, Reviewer tip check, merge (the owner's word for this session), then T63.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests).
