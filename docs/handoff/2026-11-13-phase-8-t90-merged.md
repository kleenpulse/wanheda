# Hand-off — Phase 8: T90 merged

## State in one paragraph

PR #104 (T90, the installer ships no server) is merged on the owner's word ("make the PR and merged when ready"): `main` at `f302c04`, deployed to production by the merge. Before merging, every check passed: CI `check`, both `rails`, GitGuardian, and the Desktop workflow's Windows installer build (2m52s, the first without the smoke step). The merge was pinned to the head `8471f4b`. Before the pull: the incoming commits are +0100 with author TZ = committer TZ, `forged-commits.sh` is clean, the local tip is an ancestor, and the merge's tree is identical to `8471f4b`'s. `git tidy` left only `main`. T90's details are in [2026-11-13-phase-8-t90-desktop-no-server.md](2026-11-13-phase-8-t90-desktop-no-server.md).

## Next steps (in order)

1. Owner, sometime: in `desktop:preview` while signed in, try a native folder and read-aloud (open since T88).
2. The next release (`bun run bump`, only on the owner's word) ships the smaller installer. Its first start deletes the old `secrets.json`; check `main.log` says so on the owner's machine.
3. T91: a service worker for offline cold start.
4. Still open: the real Neon account-deletion test (`2026-11-09-phase-8-account-deletion.md`); T89 review nit 3 (a late `wanheda://auth` link is dropped silently while the login panel waits).

## Notes

- This hand-off and `LATEST.md` are uncommitted on `main`: commit them with the next task's first commit.
- `desktop/.out/Wanheda-0.7.4-win-x64.exe` is a local measurement build, not the released 0.7.4. Never upload it.
- `bun run lint` on the whole repo crashes on the ignored `brag-output-2026-11-11-164928/` folder (its `work/*.js`). Deleting that folder or adding it to ESLint's ignores would fix it; that's the owner's call.
