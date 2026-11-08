# Latest hand-off

**Newest:** [2026-11-08-phase-7-done.md](2026-11-08-phase-7-done.md). **Phase 7 (Media) is done: T65 ticked. Owner checks 4–7 passed on `main` @ `5a09e99` (Sound pause|duck|mix, `meta.folder` reload, lapsed permission ⇒ "Up next" card with no countdown, plays persist, rescan prunes); 7c (unplugged drive keeps history) not run, as there was no removable drive. No code changed, no migration. Next: the owner merges `docs/phase-7-done`; the Phase 7 minor release only on the owner's word; then Phase 8 (Desktop, Electron) planning in a fresh session.**

**Before it:** [2026-11-08-phase-7-t65-sound-run.md](2026-11-08-phase-7-t65-sound-run.md). T65 checks 1–3 passed; check 4 failed in pause mode ⇒ B25, fades, speech pause lets go, wheel tunes every slider; #68–#73 merged.

**Earlier:** [2026-11-08-phase-7-media-home-built.md](2026-11-08-phase-7-media-home-built.md) (T73, #66), [2026-11-08-phase-7-media-player-built.md](2026-11-08-phase-7-media-player-built.md) (T72, #65), [2026-11-07-phase-7-exit-machine.md](2026-11-07-phase-7-exit-machine.md) (T65 machine run).

- After each merge: `git tidy` (local alias).
- The checkout may be shared with another session: check the branch before staging.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests).

### Builder prompt (Phase 8)

```text
You are the BUILDER for Wanheda (D:\Vxrcel\wanheda), lean mode, no worktrees.
Start: git switch main, git fetch + incoming-commit check, pull, then tripwire, typecheck, tests. Run git tidy.
Read docs/handoff/LATEST.md → 2026-11-08-phase-7-done.md, then FRD §Phase 8 and the files it lists.
Phase 8 = Desktop (Electron), ported from Raven's desktop/. First plan it with the spec skill:
§T tasks with checkpoints and the exit task (FRD exit criteria), plus §V invariants; get the owner's OK.
Every package and binary (Electron, electron-builder, ffmpeg, mpv, sherpa-onnx): pinned exact, ≥ 7 days old,
supply chain read before install. No tracked .js/.cjs/.mjs (tripwire). The checkout may be shared: check the branch.
```

### Reviewer prompt (Phase 8)

```text
You are the REVIEWER for Wanheda (D:\Vxrcel\wanheda). Use the diff-reviewer skill; read-only.
One pass per PR, bugs and edge cases only, verdict LGTM / LGTM with nits / FIX, sent to the Builder.
Read docs/handoff/LATEST.md → 2026-11-08-phase-7-done.md. Nothing pending: wait for the Builder's request.
Phase 8 = Electron. Weigh hardest: preload bridge surface, IPC input checks, CSP, deep-link allow-list,
safeStorage secrets, utility-process server, auto-update source, bundled binaries, and boot-time configs
(*.config.*, package.json scripts, .vscode/) against the worm rules in CLAUDE.md.
```
