# Hand-off — Phase 6: Voice — CP2, the speech core (T54)

| | |
|---|---|
| Date | 2026-11-06 |
| Phase / checkpoint | Phase 6, CP2 = T54 speech core done |
| Branch | `phase-6/speech-core` (off `main` at `54a7f0c`; forged-commit check on `54a7f0c..origin/main` clean, 0 commits) |
| Open PR | opened after the Reviewer peer's LGTM (see Review state) |
| Previous hand-off | docs/handoff/2026-11-06-phase-6-tts-spike.md |

## State in one paragraph

Wanheda can speak. `lib/speech/` holds the whole engine side of Phase 6. The Piper engine runs onnxruntime-web 1.31.1 + `phonemizer` 1.2.1 in a Worker, and Web Speech is the zero-download fallback. A queue cuts sentences into ramping units and schedules them back to back on one AudioContext clock, prefetching by queued seconds. One zustand store drives it, with one speaking tab per device through a Web Lock. Voices are kept in OPFS from a pinned catalog. The reader pre-warms the voice once a document's text has settled. There is no speech UI yet: the reader's "play from here" is T56, and the island card and mini window are T57. The engine was proved in a real Chrome against the owner's running dev server: the voice installed, the runtime assets came from the same origin, and the store played three sentences on Piper with the sentence index following the audio.

## Done this session

- **Verified on start:** `main` = `origin/main` = `54a7f0c`, tripwire clean, typecheck clean, tests 978/978.
- **companion-tts scanned** before porting (worm regex, campaign markers, eval, hidden long lines): clean. Its last 50 commits have no forged timezones.
- **Supply chain** (onnxruntime-web 1.31.1, phonemizer 1.2.1 and their transitive packages: 19 resolved and checked; 17 added to bun.lock, because `@types/node` 26 and `undici-types` dedupe onto what's already installed):
  - every package at least 7 days old (ORT 11 days);
  - the 19 tarballs' sha512 match the registry, and the 17 bun.lock additions' integrities match those;
  - IOC regex clean on the tarballs and on the installed `node_modules` copies;
  - no install scripts except `protobufjs`'s postinstall, a version-scheme warning, blocked by Bun;
  - `@types/node` stays at 24.19.2.
- **Ported from companion-tts, with their tests:** `transform.ts` (note markdown → speakable sentences, split with the reader's own `segment`; the chat-only length cap and packing were not ported), `revealEdge` (`reveal.ts`), the `player.ts` graph (limiter, gain, analyser, now fed by scheduled buffers), and `queue.ts` (adapted: see below).
- **New in `lib/speech/`:**
  - `engine.ts`: the `TtsEngine` union, `pcm` (Piper) | `speak` (Web Speech).
  - `units.ts`: `cutUnit` (clause end, else space, else hard cut, never inside a surrogate pair); the ramp `nextCap` = min(2, 0.8 ÷ RTF) × the previous cap, floor 60, max 200; `budgetCap` = the most characters whose synthesis fits in 0.8 × the queued seconds. A unit's cap is the smaller of the two.
  - `queue.ts`: one synthesis at a time; synthesis continues while less than 12 s is queued or fewer than 2 units wait; start(n+1) = end(n); synthesized units stay cached (the 2 sentences behind the playhead and everything ahead), so next and prev don't synthesize again; `setRate` keeps the playing unit; `stats()` gives maxGapMs, underruns and rtf.
  - `piper-ids.ts`: phonemize between punctuation runs and keep the first `,.?!:;` mark of each run; ids are NFD code points wrapped `^ _ … $`; voice config parsing.
  - `piper.worker.ts`, `piper-protocol.ts`, `wasm-memory.ts` (a Proxy on `WebAssembly.Memory`), `piper.ts`: the page-side engine. Holds keep the worker; it is released after 3 idle minutes, and recycled between units past 400 MB of wasm memory, then warmed again.
  - `voices.ts`: the catalog (lessac at `b4e358f`; the model's sha256 = the HF LFS oid, and the config's git blob matches its pinned oid), OPFS `wanheda-voices/`, and an install that writes `.part`, checks size and sha256, then calls `move()`.
  - `web-speech.ts`, `store.ts`, `prewarm.ts`.
- **Wiring:**
  - `next.config.ts` aliases `onnxruntime-web/wasm` to `dist/ort.wasm.min.mjs`. The package's default for that path is a bundle with the glue inlined, not the file ADR-0012 cleared.
  - `ensureText` now returns a Promise that settles when its job does. It is job-deduplicated, and its cleanup runs after the job is registered, even when a demo job finishes without awaiting.
  - `document-view.tsx` holds the engine while a reader is open and pre-warms once the text has settled.
- **Tests:**
  - the V47 gap test on a fake engine: a 420-character sentence, and "long, Yes., No., long", each with max gap ≤ 50 ms;
  - a counter-case at RTF 1.2 showing the check can fail;
  - ramp, prefetch, seek, cache, stop and rate cases;
  - the ORT and phonemizer eval-free check, the version pins, and the alias.
- **Gates:**
  - tripwire clean and typecheck clean; `bun run build` passes, with the 3 ORT files emitted as hashed same-origin media;
  - tests 1038/1038 on a rerun. The first full run had 2 load flakes, `money-runtime` and `auth/server`; both pass alone (24/24) and on the rerun.
- **Browser check:**
  - Setup: a temporary dev-only window handle, removed before commit. It ran against the owner's already-running dev server on :3000, PID 13916. Port 3043 was refused because another dev server already held the repo, and that server wasn't killed.
  - Results:
    - voice install 92 s, verified;
    - worker assets same-origin;
    - cold warm 18.9 s; warmed RTF ≈ 1.0 (the spike's 0.38 was with Chrome in front, so this window was throttled, per ADR-0012's caveat);
    - `play` picked Piper, first audio at 834 ms on "Yes.", sentences 0 → 1 → 2 followed the audio, and the store was idle with no error at the end.

- **Second browser run (Reviewer nit 3), wasm heap:**
  - The Proxy sees ORT's memory: 144 MB after load (ADR-0012 measured 145).
  - Growth by unit: 60 chars 144 MB, 120 chars 208 MB, then 200-char units hold flat at **300 MB** over 4 runs, because ORT reuses its arena.
  - So the 400 MB recycle doesn't fire in steady state at the 200 cap: it's a safety net, not a reload per unit.
  - Less throttled this time: load 6.2 s; 200 chars (≈ 13 s of audio) synthesized in 3.3–4.1 s, about RTF 0.3, near the spike's 0.38.
  - `piper.wasmBytes` now records the last reported size, for the T58 exit log.

## Decisions made (Builder calls)

- **Unit cap = min(ramp, budget).** The ramp alone fails when play starts on a short sentence ("Yes." is followed by a 60-character unit that can't be ready in time). The budget rule ties each cut to the audio actually queued.
- **Synthesis is serial.** One worker thread can't run two at once anyway, and serial makes stop and seek exact.
- **On a Piper failure, Web Speech takes over from the same sentence** and shows a note. The owner can change this when fallback order becomes a preference (V45 "owner pref", T55/T57).
- **A minimal verified voice install is in T54** so the engine can be run at all. The voice manager UI, progress, cancel and delete stay T55.

## Known problems and risks

- **The owner's Chrome now holds the lessac voice** (63 MB, OPFS `wanheda-voices/`, origin localhost:3000). There's no delete UI until T55; clearing site data removes it.
- **Throttling:** this run's absolute numbers are throttled. T58 must measure with Chrome in front.
- **Lowercase list items** stay one sentence: UAX #29 doesn't break before a lowercase word. They're read with their pauses, and the highlight covers the whole run.
- **Web Speech** has no timing: the highlight moves per utterance and a rate change restarts the sentence.
- **Web Speech has no watchdog yet** (Reviewer nit 2, optional part): Chrome sometimes never fires `end` or `error` on an utterance, which would leave the status "playing". Add a timeout when the controls arrive (T57).
- **`speechStats()`** returns null once speech ends. The exit log (T58) must read it while speech is playing.
- English only, GPL espeak-ng, and the research-only voice licence: unchanged from ADR-0012.

## Next steps (in order)

1. Reviewer LGTM, then commit, push and open the PR. The user merges.
2. **Stop.** T55 (CP3, voices) starts in a fresh session.
3. Still open with the user, not to act on unasked:
   - the Phase 5 owner run;
   - eager remote images in the md book;
   - pdf.js painting in a worker;
   - asking before jumping to another device's newer place;
   - the stale remote branch `phase-5/reader-core`;
   - T52, and T44.

## Files to stage (by name)

`package.json`, `bun.lock`, `next.config.ts`, `SPEC.md`, `components/reader/document-view.tsx`, `components/reader/text.ts`, `lib/speech/engine.ts`, `lib/speech/transform.ts`, `lib/speech/transform.test.ts`, `lib/speech/reveal.ts`, `lib/speech/reveal.test.ts`, `lib/speech/units.ts`, `lib/speech/units.test.ts`, `lib/speech/queue.ts`, `lib/speech/queue.test.ts`, `lib/speech/piper-ids.ts`, `lib/speech/piper-ids.test.ts`, `lib/speech/piper-protocol.ts`, `lib/speech/piper.worker.ts`, `lib/speech/piper.ts`, `lib/speech/wasm-memory.ts`, `lib/speech/player.ts`, `lib/speech/web-speech.ts`, `lib/speech/voices.ts`, `lib/speech/store.ts`, `lib/speech/prewarm.ts`, `lib/speech/ort-bundle.test.ts`, `docs/handoff/2026-11-06-phase-6-speech-core.md`, `docs/handoff/LATEST.md`.

## Env / services touched

None in the repo. The owner's Chrome (localhost:3000) received the voice in OPFS, with downloads from huggingface.co.

## Review state

Reviewer peer (wanheda-2a), one pass on the uncommitted diff: **LGTM with nits**, no FIX. Nits:
1. The engine choice read rate and voice at the press. **Taken:** they are read when the engine is chosen.
2. A seek or rate change while paused made Web Speech speak. **Taken:** the driver keeps a paused flag; a seek or rate change while paused waits for resume; drivers start paused when the owner paused during the engine choice. The optional watchdog is deferred (see risks).
3. Is recycle measured? **Measured:** see "Second browser run". The heap is flat at 300 MB, so no change.
4. Package count. **Fixed:** 19 checked, 17 added to the lock.

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only. One pass, bugs and edge cases only, verdict LGTM / LGTM with nits / FIX, sent to the
Builder. Your LGTM is not the user's approval.
Target: the uncommitted T54 diff on branch phase-6/speech-core: lib/speech/*, reader wiring
(document-view.tsx, text.ts ensureText → Promise), next.config.ts ORT alias, 2 new deps.
Check: queue.ts scheduling/abort/cache/setRate edges; the store's generation + Web Lock races;
piper.ts hold/release/recycle; worker load/cancel; ensureText job map; supply-chain claims.
Context: docs/handoff/2026-11-06-phase-6-speech-core.md, SPEC V45/V47/V50, ADR-0012.
```

### Builder prompt (Phase 6, CP3)

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda (lean mode, one checkpoint,
no worktrees; rules in CLAUDE.md and docs/handoff/README.md).
Start from docs/handoff/LATEST.md → docs/handoff/2026-11-06-phase-6-speech-core.md; verify
(git, tripwire, typecheck, tests). Forged-check the merge range before pulling.
Next: T55 `phase-6/voices`, SPEC V46: the voice manager over lib/speech/voices.ts (catalog
filters, size, licence from MODEL_CARD, download progress + cancel, delete, default voice +
rate prefs, island `transfer` activity). Re-check each new catalog entry's size + sha256
against its pinned piper-voices revision before adding it.
```
