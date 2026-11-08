# Latest hand-off

**Newest:** [2026-11-08-phase-8-t74-spike.md](2026-11-08-phase-8-t74-spike.md). **T74 (spike) done ⇒ ADR-0014 + pins; T74 ticked, V68/V70/V71/V73/V74/V76 amended. Raven bootstrap works on Next 16.4.5; origin = `localhost` (passkeys refuse 127.0.0.1); island over fullscreen + click-through ok, hover by cursor polling; media keys via globalShortcut only while audible; sherpa-onnx 2.0.1 in a utility process = 3.5–3.7× WASM at 2 threads; installer ≈ 102 MB before ffmpeg. Docs only, uncommitted on `phase-8/desktop-spike` (stacked on open PR #77). Owner action later: a "Wanheda Desktop" GitHub OAuth app. Next: owner reviews ADR-0014, then T75 in a fresh session.**

**Before it:** [2026-11-08-phase-8-plan.md](2026-11-08-phase-8-plan.md). Phase 8 planned: SPEC V67–V76, T74–T83 (PR #77).

**Earlier:** [2026-11-08-phase-7-done.md](2026-11-08-phase-7-done.md) (Phase 7 done, v0.7.0), [2026-11-08-phase-7-t65-sound-run.md](2026-11-08-phase-7-t65-sound-run.md), [2026-11-08-phase-7-media-home-built.md](2026-11-08-phase-7-media-home-built.md) (T73, #66), [2026-11-08-phase-7-media-player-built.md](2026-11-08-phase-7-media-player-built.md) (T72, #65).

- After each merge: `git tidy` (local alias).
- The checkout may be shared with another session: check the branch before staging.

Read the hand-off first, then verify it against the repo before trusting it (git, tripwire, typecheck, tests).

### Builder prompt (T75)

```text
You are the BUILDER for Wanheda (D:Vxrcelwanheda), lean mode, no worktrees. Check the branch first: the checkout may be shared.
Start: git switch main, fetch + incoming-commit check, pull, tripwire, typecheck, tests, git tidy.
Read docs/handoff/LATEST.md → 2026-11-08-phase-8-t74-spike.md, then ADR-0014, SPEC T75 and V67–V69, V76.
Do T75 (desktop shell) on phase-8/desktop-shell: port Raven desktop/ per ADR-0014 pins and decisions.
The owner's link is metered: reuse the cached Electron zip, no big downloads without asking.
```

### Reviewer prompt (Phase 8)

```text
You are the REVIEWER for Wanheda (D:\Vxrcel\wanheda). Use the diff-reviewer skill; read-only.
One pass per PR, bugs and edge cases only, verdict LGTM / LGTM with nits / FIX, sent to the Builder.
Read docs/handoff/LATEST.md → 2026-11-08-phase-8-plan.md and SPEC V67–V76. Wait for the Builder's request.
Weigh hardest: preload bridge surface, IPC sender + input checks, CSP, URL policy, deep links, safeStorage secrets,
server token/Host guard, update source, bundled binaries, and boot-time configs against the worm rules in CLAUDE.md.
```
