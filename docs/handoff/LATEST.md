# Latest hand-off

**Newest:** [2026-11-09-phase-8-t78-desktop-files.md](2026-11-09-phase-8-t78-desktop-files.md). **T78 (native folders) built and checked in preview: music and video folders picked in the shell's dialog, read only through `wanheda-file:` (realpath guard, Range, CORS for the app), music scan and playback, videos fingerprinted by ranges and played from the URL, folder watch. T78 ticked, V72 amended. Reviewer wanheda-87: LGTM with nits (2 taken); PR from `phase-8/desktop-files`, merged on the owner's standing go-ahead.**

**Before it:** [2026-11-09-phase-8-t77-desktop-island.md](2026-11-09-phase-8-t77-desktop-island.md). T77 floating island merged as PR #82 at `e5168c7` (wanheda-87: FIX ×2 fixed, LGTM, push and main checks passed).

**Earlier:** [2026-11-09-phase-8-t76-desktop-native.md](2026-11-09-phase-8-t76-desktop-native.md) (T76 native, PR #81), [2026-11-08-phase-8-t75-desktop-shell.md](2026-11-08-phase-8-t75-desktop-shell.md) (T75 shell, PR #80), [2026-11-08-phase-8-t74-spike.md](2026-11-08-phase-8-t74-spike.md) (T74 spike, ADR-0014, PR #78), [2026-11-08-phase-8-plan.md](2026-11-08-phase-8-plan.md) (Phase 8 planned, V67–V76, T74–T83), [2026-11-08-phase-7-done.md](2026-11-08-phase-7-done.md) (Phase 7 done, v0.7.0).

- After each merge: `git tidy` (local alias).
- The checkout may be shared with another session: check the branch before staging.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests).

### Builder prompt (T79)

```text
You are the BUILDER for Wanheda (D:\Vxrcel\wanheda), lean mode, no worktrees. Check the branch first: the checkout may be shared.
Start: git switch main, fetch + incoming-commit check, pull, tripwire, typecheck, tests, git tidy, bun run desktop:setup.
Read docs/handoff/LATEST.md → 2026-11-09-phase-8-t78-desktop-files.md, desktop/README.md, ADR-0014 (native Piper), SPEC T79 and V46, V73.
Do T79 (desktop TTS) on phase-8/desktop-tts. The owner's link is metered: check the sherpa-onnx package size first; no big downloads without asking.
```
