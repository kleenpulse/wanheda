# Hand-off — Phase 6: Voice — CP1, the TTS spike (T53)

| | |
|---|---|
| Date | 2026-11-06 |
| Phase / checkpoint | Phase 6 planned (V45–V50, T53–T59); CP1 = T53 spike done, ADR-0012 written |
| Branch | `phase-6/tts-spike` (off `main` at `78277c1`; PR #36 is **merged**, so the previous LATEST.md calling it open was out of date; no commits after `78277c1`, forged-commit check on `060ba28..origin/main` clean) |
| Open PR | opened after the Reviewer peer's LGTM (see Review state) |
| Previous hand-off | docs/handoff/2026-11-06-phase-5-done.md |

## State in one paragraph

Phase 6 is planned in SPEC and its engine is chosen. Piper in the browser will run on raw `onnxruntime-web` 1.31.1 plus the `phonemizer` 1.2.1 package (espeak-ng). That is the same pipeline companion-tts runs natively through `piper-rs`. The spike's main finding: loading a medium voice model takes about 2–3.7 s on this machine on every engine (the chosen engine 3.0 s), so a cold "play" can never meet the < 1.5 s exit target. The owner chose to pre-warm the voice when a reader opens. Speech runs single-threaded with no COOP/COEP, because isolating the app would break the YouTube embed planned for Phase 7. Single-threaded synthesis is already about 2.6× faster than real time, and threads switch on by header alone later. This branch holds docs and spec only: no app code and no new dependencies.

## Done this session

- **Verified on start:** `main` = `origin/main` = `78277c1`. Tripwire clean, typecheck clean. Tests 978/978: the first full run had 1 failure and a rerun passed 978/978. The failing test's name was lost because the output was cut too short (a known load flake is likely).
- **Phase 6 plan in SPEC:**
  - **V45 Engines:** one `TtsEngine`; Piper in a Worker; Web Speech fallback; offline; assets same-origin; engine per ADR-0012.
  - **V46 Voices:** pinned HF catalog; OPFS `.part` + size/digest check + rename; licence shown.
  - **V47 Pipeline:** a unit is one sentence or a piece of one, so the highlight is exact; units are capped at about 200 chars; after play or seek, unit sizes ramp 60 → 120 → 200 at the measured RTF; prefetch counts queued audio seconds (≥ 12 s), never fewer than 2 units ahead; the last 2 units are kept; one AudioContext clock.
  - **V48 Read-along (owner's rulings):** while follow is on, the spoken sentence saves as the reading place. An owner scroll, wheel, drag, turn or key turns follow off. An arrow pill points toward the spoken sentence (↑/↓ in scroll view, ←/→ in the book), and a click resumes follow.
  - **V49 Surfaces:** one speech store drives the reader, the island `speech` card and the mini window; Media Session; sleep timer.
  - **V50 Exit numbers.**
  - **V41** gets a pointer to V48.
  - **Tasks:** T53 spike, T54 speech core, T55 voices, T56 read-along, T57 surfaces, T58 exit, T59 later.
- **T53 spike (Eta, in the session scratchpad, outside the repo):**
  - **Voice:** `en_US-lessac-medium` at piper-voices revision `b4e358f`.
  - **Supply chain:** every tarball sha512 checked, no lifecycle script ran, IOC scan clean twice.
  - **Results:** numbers in ADR-0012 and in the T53 row.
  - **Builder re-run:** under heavy throttling it confirmed that cold start is far over 1.5 s on every engine. It could not confirm the absolute numbers or the order of the top two.
  - **`eval` check:** the ORT files we would ship (`ort.wasm.min.mjs`, `ort-wasm-simd-threaded.mjs`) and `phonemizer` hold no `eval(` and no `new Function(`.
- **ADR-0012** written; ADR-0005 status points to it; ADR index updated.

## Decisions made

- Saved place follows the voice while follow is on (owner).
- Scrolling stops the follow, and a direction arrow resumes it (owner).
- Pre-warm the voice on reader open (owner). The exit measures with the reader already open.
- Engine: raw ORT + `phonemizer` (owner asked which engine companion-tts uses: `piper-rs`, ONNX Runtime + espeak-ng; this is its browser twin, and it was Eta's pick).
- Threads: 1 thread and no isolation headers for now (Builder call on the owner's "choose the best for UX"). Revisit after the Phase 7 embed test with `COEP: credentialless`.

## Known problems and risks

- **English only:** `phonemizer` 1.2.1 ships English espeak data.
- **Memory:** the speech worker's wasm memory only grows (about 145 MB after load, about 615 MB after a 400-character sentence). Recycle the worker when idle and cap the unit length.
- **Throttling:** Windows throttles a Chrome window that isn't in front by 2–5×. Exit measurements must run with Chrome in front.
- **Licences:**
  - espeak-ng is GPL-3, inside `phonemizer` (whose licence field says Apache-2.0). That matters only if Wanheda is ever distributed (ADR-0005).
  - The lessac voice dataset is research-only. Fine for a personal app, and the voice manager must show each voice's licence.
- **companion-tts source:** it lives under `D:\Vxrcel` (worm-era). T54 scans it before porting.
- **Kokoro** was not benchmarked (T59).

## Next steps (in order)

1. The user merges this PR.
2. **Stop.** T54 (CP2, speech core) starts in a fresh session from the Builder prompt below.
3. Still open with the user, not to act on unasked:
   - the Phase 5 owner run;
   - eager remote images in the md book;
   - pdf.js painting in a worker;
   - whether an open reader asks before jumping to another device's newer place;
   - the stale remote branch `phase-5/reader-core`;
   - T52, and T44 (first real Polar sale).

## Files to stage (by name)

`SPEC.md`, `docs/adr/0012-tts-web-engine-onnxruntime-web.md`, `docs/adr/0005-tts-piper-kokoro.md`, `docs/adr/README.md`, `docs/handoff/2026-11-06-phase-6-tts-spike.md`, `docs/handoff/LATEST.md`.

## Env / services touched

None.

## Review state

- Reviewer peer (wanheda-2a), one pass on the uncommitted docs diff: **FIX**, two items, both taken:
  - **FIX 1 (V47):** fixed-size units with prefetch by count leave 2–8 s gaps on one thread. Now: a ~200-char cap, a ramp after play or seek, prefetch by queued seconds, and a gap test on a fake engine (T54).
  - **FIX 2 (V48):** saving text.json's md/txt locator would save an estimate. Now the reader's own place is saved once the spoken sentence is on screen, with a test (T56).
- All nits taken:
  - V41 × V48 precedence: while speaking with follow on, this device wins.
  - What turns follow off is defined: navigation only, never a press on a bar, and never the speech controls or the pill.
  - Pressing play before `text.json` exists shows extraction progress.
  - Pre-warm is gated on the document kind.
  - Worker recycled above 400 MB.
  - "Same-origin" now means the ORT runtime files only.
  - One speaking tab per device, through a Web Lock.
  - Model load reads "≈ 2–3 s".
  - Kokoro needs its own spike.
- My own addition: the ramp follows the measured RTF, so a throttled tab doesn't gap.
- Re-review: **LGTM with nits**, both taken: unit caps never fall below 60 characters (at RTF ≥ 1 gaps are accepted and the player offers Web Speech), and V47's 12 s margin wording is corrected.

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only. One pass, bugs and edge cases only, verdict LGTM / LGTM with nits / FIX, sent to the
Builder. Your LGTM is not the user's approval.
Target: the uncommitted T53 diff on branch phase-6/tts-spike (docs + SPEC only): Phase 6
invariants V45–V50, tasks T53–T59, V41 amendment, ADR-0012, ADR-0005 status, hand-off.
Check: the invariants are buildable and don't contradict V24, V41, V44 or each other (follow-off
vs V41's owner-move gate, pre-warm vs memory, first-unit cut vs exact highlight); the ADR's
numbers match the T53 row; the tripwire passes.
Context: docs/handoff/2026-11-06-phase-6-tts-spike.md.
```

### Builder prompt (Phase 6, CP2)

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda. Lean mode (user, 2026-11-04,
tightened 2026-11-05): build features; tests only where they guard real logic or a spec exit
case; keep tripwire, forged-commit check and CI; one typecheck + test run before a commit;
after the Reviewer peer's LGTM (or LGTM with nits) commit, push and open the PR without asking;
merge and db:migrate stay the user's. A short hand-off + continuation prompt after every PR.
No worktrees. One checkpoint per session. House goal (CLAUDE.md): native-app feel, V24.

Start from docs/handoff/LATEST.md and docs/handoff/2026-11-06-phase-6-tts-spike.md, then verify
against the repo (git, tripwire, typecheck, tests). Check the T53 PR is merged (git log main) and
check incoming commits for forgeries before pulling (sh scripts/forged-commits.sh <range>).

CP2 = T54 `phase-6/speech-core` (SPEC V45, V47, V50; ADR-0012). lib/speech/: port companion-tts
transform.ts, queue.ts, player.ts and revealEdge with their tests. Scan D:\Vxrcel\companion-tts's
source with the worm regex first (worm-era tree). Then: the TtsEngine interface; the Piper engine
in a Worker on onnxruntime-web 1.31.1 (ort.wasm.min.mjs + ort-wasm-simd-threaded.{mjs,wasm} only,
same-origin) + phonemizer 1.2.1, pinned exact, supply-chain read before install (age ≥ 7 d,
deps, install scripts, IOC regex; sha512 vs the registry); a test asserting no eval( and no
new Function( in the shipped ORT files; ids from phoneme_id_map (BOS ^, EOS $, pad _); speed =
length_scale; numThreads = crossOriginIsolated ? min(4, cores) : 1; Web Speech engine; units
= 1 sentence or a piece of one (never 2 sentences in a unit), cap ~200 chars split at clauses;
after play/seek caps ramp 60 → 120 → 200, each ≤ min(2, 0.8 ÷ measured RTF) × the previous;
the scheduler on one AudioContext clock, prefetching by queued audio seconds (< 12 s ⇒ synth;
floor N+1..N+2; keep N-1..N-2), with the V47 gap test on a fake engine (synth = 0.4 × audio,
audio = chars ÷ 15 s; a 420-char sentence and "long, Yes., No., long" ⇒ max gap ≤ 50 ms); the
speech store (one speaking tab per device: Web Lock wanheda-speech with steal); pre-warm hook
(reader open on a pdf|md|txt doc ⇒ load the voice at idle after ensureText settles; release
after idle; recycle the worker between units above 400 MB of wasm memory); a zero-env/demo path. The spike
harness (worker-ortraw.ts, common.ts piperIds) is in the previous session's scratchpad, not
the repo: rebuild from ADR-0012, don't copy unreviewed files in.

Still open with the user, don't act on them unasked: the Phase 5 owner run, eager remote images
in the md book, pdf.js painting in a worker, asking before jumping to another device's newer
place, the stale remote branch phase-5/reader-core, T52, T44 (first real Polar sale).
```
