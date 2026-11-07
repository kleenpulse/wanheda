# Latest hand-off

**Newest:** [2026-11-07-music-list-height.md](2026-11-07-music-list-height.md). **T67 password-protected PDFs merged (#50, `5523fb7`, post-merge VERIFIED). `fix/music-list-height`: Reviewer LGTM, PR next.**

- Music tab: the list fills the height under its tabs and scrolls on its own; the page never scrolls there (`data-page-fill` + CSS has() in PageFrame).
- Next: T64 `phase-7/music-player`.
- Deferred nit (T67): prune PDF passwords of documents deleted on other devices, only against a fresh server library.
- Migrations 0009 and 0010 are **not applied**. A peer relayed a go-ahead; the Builder waits for the user's own word.
- The merged remote branches `phase-7/media-core`, `phase-7/video`, `phase-7/music-library` and `fix/pdf-password` are the owner's to delete.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests).
