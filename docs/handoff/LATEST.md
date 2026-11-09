# Latest hand-off

**Newest:** [2026-11-09-phase-8-t79-desktop-tts.md](2026-11-09-phase-8-t79-desktop-tts.md). **T79 (native speech) built and checked: sherpa-onnx Piper in its own process (≈ 13× real time, RTF 0.076 in preview), voices handed over from the page's OPFS copy and checked against the catalog (no second download), WASM fallback, `speech/` packaged and verified in the installer. T79 ticked. Reviewer wanheda-87: LGTM with nits (both taken); PR from `phase-8/desktop-tts`, merged on the owner's standing go-ahead. T80 (ffmpeg ≈ 126 MB) waits for the owner's yes.**

**Before it:** [2026-11-09-phase-8-t78-desktop-files.md](2026-11-09-phase-8-t78-desktop-files.md). T78 native folders merged as PR #83 at `3d7423a` (wanheda-87: LGTM with nits, push and main checks passed).

**Earlier:** [2026-11-09-phase-8-t77-desktop-island.md](2026-11-09-phase-8-t77-desktop-island.md) (T77 island, PR #82), [2026-11-09-phase-8-t76-desktop-native.md](2026-11-09-phase-8-t76-desktop-native.md) (T76 native, PR #81), [2026-11-08-phase-8-t75-desktop-shell.md](2026-11-08-phase-8-t75-desktop-shell.md) (T75 shell, PR #80), [2026-11-08-phase-8-t74-spike.md](2026-11-08-phase-8-t74-spike.md) (T74 spike, ADR-0014, PR #78), [2026-11-08-phase-8-plan.md](2026-11-08-phase-8-plan.md) (Phase 8 planned, V67–V76, T74–T83), [2026-11-08-phase-7-done.md](2026-11-08-phase-7-done.md) (Phase 7 done, v0.7.0).

- After each merge: `git tidy` (local alias).
- The checkout may be shared with another session: check the branch before staging.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests).

### Builder prompt (T80) — needs the owner's yes first (ffmpeg ≈ 126 MB on a metered link)

```text
You are the BUILDER for Wanheda (D:\Vxrcel\wanheda), lean mode, no worktrees. Check the branch first: the checkout may be shared.
Start: git switch main, fetch + incoming-commit check, pull, tripwire, typecheck, tests, git tidy, bun run desktop:setup.
Read docs/handoff/LATEST.md → 2026-11-09-phase-8-t79-desktop-tts.md, desktop/README.md, ADR-0014 (ffmpeg), SPEC T80 and V52, V53.
Do T80 (desktop media: bundled ffmpeg) on phase-8/desktop-media. The ffmpeg download is about 126 MB: confirm with the owner before fetching it.
```
