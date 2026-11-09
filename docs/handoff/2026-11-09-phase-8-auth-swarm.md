# Hand-off — Phase 8: sign-in swarm (T86) — built, waiting for code review

| | |
|---|---|
| Date | 2026-11-09 |
| Phase / checkpoint | P8 side request (owner): a particle WANHEDA on /login that morphs per sign-in method |
| Branch | `phase-8/inlay-wordmark` (stacked on the inlay work, `b8a5035` + `8b8a77f`, PR #89), swarm uncommitted |
| HEAD at start | `8b8a77f` — docs(handoff): inlay wordmark + rail PR #89 opened |
| Previous hand-off | docs/handoff/2026-11-09-phase-8-inlay-rail.md |
| Plan | `C:\Users\skyep\.claude\plans\here-s-the-outcome-use-graceful-swan.md` (rev 3, Reviewer wanheda-aa LGTM) |

## State in one paragraph
The owner asked for Motion Garden's Swarm on the sign-in page: a giant particle "WANHEDA" at the bottom that spells PASSKEY, GITHUB or GOOGLE while one of those buttons is hovered, focused or pending, and is otherwise still. The plan went through a grilling (owner answers) and three Reviewer passes (FIX → LGTM with nits → LGTM). It is built, every gate passes, and it was checked in a browser. Mid-build the owner asked for it **edge to edge**: no page padding and no inset. It is uncommitted, waiting for the Reviewer's code pass, then the owner's word to commit and push onto PR #89's branch.

## Done this session
- `components/auth/auth-swarm.tsx`: a port of the registry Swarm on `ogl`. Float RTs, spring with a critical-damping top-up. Curl, repel, spin, orbit and the shape cycle are cut. Orthographic band with `WORD_ASPECT = 7` (measured ink aspect 7.01). A fixed 1024-wide sampler with a stratified pick, one font size and one baseline across the 4 words, Figtree 800 sampled after `document.fonts.load`. A 5 s sim-time window, then a snap pass, then the loop halts. Premultiplied alpha, additive in `.dark` only. Colours come from `resolveColors` (ink-2 at rest, signal in flight), with a MutationObserver on `<html>` for theme, skin and accent. Density buckets of 16k, 33k and 65k by band width, plus an area-based alpha gain. `enteredRef` stops the entrance replaying on a rebuild. Reduced motion snaps. Plain text in `cqi` when WebGL2 float targets are missing or the context is lost.
- `components/auth/auth-word.tsx`: the word context, plus `AuthSwarmSlot` (`next/dynamic`, ssr off).
- `lib/auth/auth-word.ts` + test: `resolveWord` (pending > inBrowser > hovered > focused > wanheda), `wordDelay` (150 ms only on the way home), `pickFromDom`.
- `components/auth/sign-in-panel.tsx`: separate hover state (mouse only) and focus state (`:focus-visible` only). `settle()` re-reads hover and focus from `button[data-method]` after a failed attempt.
- `app/(auth)/login/page.tsx`: the provider wraps `<main>`. The swarm band is `absolute inset-x-0 bottom-0`, outside the Suspense, and the card is `z-10`.
- `ogl@1.0.11` exact. SPEC V82 + T86. CHANGELOG line.

## Verification (actual results)
- `bun run typecheck`: pass. `bun run test`: 1763 passed (176 files). `bun run tripwire`: clean. eslint on the touched files: clean. `bun run build`: pass.
- Browser: standalone build on :3306 from the scratchpad, dummy auth env + unreachable DB (gives the real sign-in state with all 3 buttons, no writes), isolated context, server stopped afterwards.
  - 1440 Nebula: WANHEDA, GITHUB, GOOGLE and PASSKEY share cap height and baseline, edge to edge (band 0–1440).
  - rAF: 60/s during a morph, 0 after it settles.
  - Tab → PASSKEY.
  - Ember: normal blend, no halos, recolours live.
  - 375 @2x: legible, and the scatter-in doesn't replay on the bucket rebuild.
  - Reduced motion: instant swap.
  - Passkey click fails → PASSKEY re-read from the DOM; mouse leaves → WANHEDA (no sticky focus).
- Not exercised: the GitHub → Google gap (devtools hover jumps with no gap; covered by `wordDelay` and the effect cleanup), the `webglcontextlost` fallback, the desktop `inBrowser` hold.

## Owner feedback round (after the first build)
- Owner recording: the hover morph looked unpolished (whole word smeared into horizontal streaks) and was a bit slow; the intro was fine.
- Cause: targets were sampled row-major, so particle i kept its row and crossed the word sideways. Fix: **column-major** sampling (x, then y), so each letter reshapes in place. Hover morphs also use a stiffer spring and tighter stagger (`HOVER {2, 0.3}`, entrance stays `INTRO {1.1, 0.45}`).
- Tried and rejected by the owner: 12 px band shuffle (vertical seams), travel-only curl (ribbons), Hilbert / tiled-Hilbert order (ribbons and seams), random order (not built). The owner recorded the column-major take (`wanheda-particles.mp4`) and asked to keep it. No curl code remains.
- Reviewer nits folded in: the sampler caches are per build (`createSampler`), not module-level; the settle comment is corrected.

## Decisions made
- The owner's answers in the grilling, all in the plan: bottom of page, GPU port, one scatter-in, hover + keyboard focus + hold during pending, ink/signal, Figtree 800, reduced motion snaps, stack on inlay after its commit, desktop holds the provider word.
- Edge to edge (owner, mid-build): written into V82.
- The panel uses `data-method` + one panel ref instead of a ref Map, which tripped `react-hooks/refs`.

## Known problems and risks
- The morph has no curl, so particles travel in straight lines and the raster-order mapping gives a horizontal sweep. The owner may want a little curl back during travel only; the registry's travel fade keeps rest still.
- On short, wide viewports the card overlaps the word (owner accepted).

## Next steps (in order)
1. ~~Reviewer code pass~~: LGTM.
2. On the owner's word: commit the swarm files + this hand-off + LATEST.md (stage explicitly), push to `phase-8/inlay-wordmark`, so PR #89 carries both.
3. The owner merges.

## Files to read first
- `components/auth/auth-swarm.tsx`, `components/auth/sign-in-panel.tsx`, `lib/auth/auth-word.ts`, SPEC V82.

## Env / services touched
- None. `ogl` added as a dependency.

## Review state
- Branch / PR: `phase-8/inlay-wordmark` / PR #89 (inlay); swarm not pushed.
- Plan: LGTM (rev 3). Checkpoint 1 (diff): LGTM with 2 optional nits (both fixed), then LGTM on the morph delta, from wanheda-aa. Checkpoints 2 and 3: pending (no commit yet; waiting on the owner's word).
