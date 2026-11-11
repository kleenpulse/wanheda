# Latest hand-off

**Newest:** [2026-11-11-phase-8-account-voices.md](2026-11-11-phase-8-account-voices.md). **Owner request (T87, V83): voices downloaded on one device are offered on the others (account list in `account_voices`, a toast + Settings row, never an auto-download). Built on `phase-8/account-voices`, uncommitted, every gate passes; migration 0014 not applied. Waiting for the owner's word to commit and open the PR.**

**Before it:** [2026-11-09-phase-8-auth-swarm.md](2026-11-09-phase-8-auth-swarm.md). **Owner request (T86, V82): a particle WANHEDA across the bottom of /login, edge to edge, that spells PASSKEY / GITHUB / GOOGLE on hover, keyboard focus or pending, and is otherwise still (Motion Garden Swarm on `ogl`). Built and browser-checked on `phase-8/inlay-wordmark`, uncommitted, Reviewer LGTM (wanheda-aa); the hover morph was reworked to column-major after owner feedback. Waiting for the owner's word to commit and push onto PR #89.**

**Earlier:** [2026-11-09-phase-8-inlay-rail.md](2026-11-09-phase-8-inlay-rail.md). **Owner request: the Inlay wordmark in the expanded rail; ellum-harness rail behaviour (edge toggle, hover-only Collapse row, `useHoldRail` plus an anchored note, theatre mode holds the rail); the dark active rail item on `bg-band`. PR #89 open on `phase-8/inlay-wordmark` (`b8a5035`), waiting for the owner's merge. The shadow-garden Inlay reduced-motion fix is uncommitted in that repo (stage only that file).**

**Earlier still:** [2026-11-09-phase-8-account-deletion.md](2026-11-09-phase-8-account-deletion.md). T85 account deletion, Google sign-in and the "Last used" badge, merged as PR #88 at `bbb6d2d`.

**Earlier:** [2026-11-09-phase-8-open-signup-admin.md](2026-11-09-phase-8-open-signup-admin.md) (open sign-up + admin, PR #87), [2026-11-09-phase-8-title-bar.md](2026-11-09-phase-8-title-bar.md) (title bar, PR #86), [2026-11-09-phase-8-browser-sign-in.md](2026-11-09-phase-8-browser-sign-in.md) (browser sign-in, PR #85), [2026-11-09-phase-8-t79-desktop-tts.md](2026-11-09-phase-8-t79-desktop-tts.md) (T79 native speech, PR #84), [2026-11-09-phase-8-t78-desktop-files.md](2026-11-09-phase-8-t78-desktop-files.md) (T78 native folders, PR #83), [2026-11-09-phase-8-t77-desktop-island.md](2026-11-09-phase-8-t77-desktop-island.md) (T77 island, PR #82), [2026-11-09-phase-8-t76-desktop-native.md](2026-11-09-phase-8-t76-desktop-native.md) (T76 native, PR #81), [2026-11-08-phase-8-t75-desktop-shell.md](2026-11-08-phase-8-t75-desktop-shell.md) (T75 shell, PR #80), [2026-11-08-phase-8-t74-spike.md](2026-11-08-phase-8-t74-spike.md) (T74 spike, ADR-0014, PR #78), [2026-11-08-phase-8-plan.md](2026-11-08-phase-8-plan.md) (Phase 8 planned, V67–V76, T74–T83), [2026-11-08-phase-7-done.md](2026-11-08-phase-7-done.md) (Phase 7 done, v0.7.0).

- After each merge: `git tidy` (local alias).
- The checkout may be shared with another session: check the branch before staging.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests).

### After #89 merges

```text
You are the BUILDER for Wanheda (D:\Vxrcel\wanheda), lean mode, no worktrees. Check the branch first: the checkout may be shared.
Read docs/handoff/LATEST.md → 2026-11-09-phase-8-inlay-rail.md.
After-merge check for PR #89: git switch main, fetch, incoming-commit check (ancestor, forged-commits, author TZ = committer TZ), pull, tripwire, typecheck, tests, git tidy.
Then continue with the T80 prompt below (needs the owner's yes for the ffmpeg download).
```

### Builder prompt (T80) — needs the owner's yes first (ffmpeg ≈ 126 MB on a metered link)

```text
You are the BUILDER for Wanheda (D:\Vxrcel\wanheda), lean mode, no worktrees. Check the branch first: the checkout may be shared.
Start: git switch main, fetch + incoming-commit check, pull, tripwire, typecheck, tests, git tidy, bun run desktop:setup.
Read docs/handoff/LATEST.md → 2026-11-09-phase-8-t79-desktop-tts.md, desktop/README.md, ADR-0014 (ffmpeg), SPEC T80 and V52, V53.
Do T80 (desktop media: bundled ffmpeg) on phase-8/desktop-media. The ffmpeg download is about 126 MB: confirm with the owner before fetching it.
```
