# Hand-off — Phase 8: T89 merged

## State in one paragraph

PR #103 (T89, desktop sign-in through the system browser) is merged: `main` at `62f165e`, deployed to production by the merge. Incoming commits checked before the pull (both +0100, `forged-commits.sh` clean, local tip an ancestor), and the merge's tree is identical to the reviewed tip `3138502`. `git tidy` left only `main`. Reviewer's post-push tip check passed; its check on `main` was requested. The details of T89 are in [2026-11-12-phase-8-t89-desktop-sign-in.md](2026-11-12-phase-8-t89-desktop-sign-in.md).

## Next steps (in order)

1. Owner: one browser sign-in in `desktop:preview` against production: the sign-in page, Chrome's "Open Wanheda?" prompt, the app signed in; then signing out of the app leaves the browser signed in. While signed in, try a native folder and read-aloud (open since T88).
2. T90: drop the server from the installer (`phase-8/desktop-no-server`).
3. Still open: the real Neon account-deletion test (plan in `2026-11-09-phase-8-account-deletion.md`).

## Notes

- This hand-off and `LATEST.md` are uncommitted on `main`: commit them with T90's first commit.
- Nit 3 from the T89 review is still open (a late `wanheda://auth` link is dropped silently while the login panel waits).
