# ADR-0012: Piper on the web runs on raw onnxruntime-web, pre-warmed, single-threaded

| | |
|---|---|
| Status | Accepted |
| Date | 2026-11-06 |
| Deciders | Isaac Gideon (owner) |

Source: FRD.md D5, §6.7, Phase 6 step 1. Refines [ADR-0005](0005-tts-piper-kokoro.md). SPEC T53, V45, V50.

## Context

ADR-0005 put Piper in the browser on WASM and left the engine to a Phase 6 spike. The spike (2026-11-06, Eta) benchmarked three candidates on the owner's laptop (i7-9850H, 6 cores / 12 threads, 32 GB, Chrome 157, Windows Balanced plan). All three used the same voice, `en_US-lessac-medium` from `rhasspy/piper-voices` at revision `b4e358ffcb232591bf73a540e70f7de528e4174a` (size and md5 checked against that revision's `voices.json`). Each engine ran in a dedicated Web Worker and read the voice from OPFS. The candidates:

1. sherpa-onnx 2.0.1, from the release WASM build. The npm `sherpa-onnx` package is Node-only: its glue calls `require` and is built with NODERAWFS.
2. `@mintplex-labs/piper-tts-web` 1.0.5, which runs onnxruntime-web and piper-phonemize.
3. Raw `onnxruntime-web` 1.31.1 with the `phonemizer` 1.2.1 package (espeak-ng compiled to asm.js). Phoneme ids are mapped from the voice's `.onnx.json` exactly as Piper maps them.

Every package and asset was fetched by hand. Each tarball's sha512 was checked against the registry, and each GitHub asset's sha256 against its published digest. Nothing ran a lifecycle script, and everything was scanned with the 2026-10 worm indicators: all clean. Everything was at least 7 days old.

Results without cross-origin isolation, which is how Wanheda is served today. Each figure is the median of 3 interleaved runs, in ms unless noted:

| | sherpa-onnx | piper-tts-web | raw onnxruntime-web |
|---|---|---|---|
| Cold time to first audio | 4756 | 6505 | 5494 |
| of which: model load (session create) | 1919 | 3694 | 3031 |
| Warm time to first audio (46 / 105 chars) | 1098 / 3322 | 1208 / 3582 | 879 / 2383 |
| Real-time factor (23 sentences, ≈ 2 min of audio) | 0.381 | 0.344 | 0.382 |
| Engine assets, gzip (voice excluded) | 12.3 MB | 12.4 MB | 4.3 MB |
| Rate control | yes (weaker than asked) | no | yes (`length_scale`) |
| Offline, from OPFS + HTTP cache | yes | only with every path self-hosted | yes |
| Main-thread long tasks while speaking | none | none | none |

With COOP + COEP `require-corp` (threads available), raw onnxruntime-web on 4 threads reached a real-time factor of 0.134 and a warm first audio of 400–855 ms. sherpa's release build has no threads.

Caveats:

- Absolute numbers swing by about 2× with Windows power throttling. Comparisons between engines are fair because the runs were interleaved.
- A Builder re-run under heavier throttling (on AC power, Chrome behind the editor) confirmed that cold start is well over 1.5 s on every engine: 10–27 s at that moment. It could not confirm the absolute figures or the order of the top two.
- The model load alone takes about 2–3.7 s on this machine (medians; the chosen engine 3.0 s). **No engine can meet the "first audio < 1.5 s" exit from a cold start.**

The audio was judged by its phonemes, not by listening. Candidate 3's phonemes matched piper-phonemize's on 22 of 23 sentences (a single phoneme differed in the 23rd). Its per-sentence audio lengths matched candidate 2's (median ratio 0.985). WAVs were saved in the spike's scratch folder.

companion-tts runs Piper through `piper-rs` 0.2, which is ONNX Runtime plus espeak-ng. Candidate 3 is that same pipeline compiled for the browser.

## Decision

- **Engine:** `onnxruntime-web` 1.31.1 (`ort.wasm.min.mjs` plus `ort-wasm-simd-threaded.{mjs,wasm}`) and `phonemizer` 1.2.1, both pinned exact and served same-origin. The worker builds ids from the voice's `phoneme_id_map`, wrapping them in BOS `^` and EOS `$` with pad `_` between ids. Speed is set with `length_scale`.
  - The files we load hold no `eval(` and no `new Function(`. The hits are in other ORT builds (asyncify, jsep, jspi and the bundles), which we don't ship. Same rule as V40.
- **Pre-warm (owner, 2026-11-06):** when a reader opens a PDF, Markdown or text document, the speech worker loads the chosen voice during idle time, once text extraction has settled. The voice doesn't depend on the document, so a new document's first open warms it too. The exit measures press → first audio with the reader already open.
- **Memory:** wasm memory only grows: about 145 MB after load, about 615 MB after a 400-character sentence. So:
  - the worker is released after a few idle minutes with no reader open and no speech;
  - it is recycled between units once its wasm memory passes 400 MB;
  - the unit cap below keeps the peak down.
- **Threads (Builder call, on the owner's "best for UX"):** no COOP/COEP headers for now.
  - The worker sets `numThreads = crossOriginIsolated ? min(4, hardwareConcurrency) : 1`, so threads switch on by header alone.
  - Single-threaded speech is already about 2.6× faster than real time, so there are no gaps.
  - Next and previous stay instant because the queue keeps the next 2 and the last 2 units' audio, and at least 12 s queued ahead.
  - Isolating the app would break third-party embeds (YouTube, Phase 7).
- **Units (amended after review):** a unit is one sentence or a piece of one, at most about 200 characters, split at clause boundaries. A 400-character sentence takes 6–9 s to synthesise on one thread.
  - **Ramp:** after play or seek, unit sizes ramp up: 60, 120, 200 characters. Each cap is at most min(2, 0.8 ÷ measured RTF) times the previous one, so each unit is ready before the one before it finishes playing. A throttled tab ramps more slowly instead of leaving gaps. Caps never fall below 60 characters. At an RTF of 1 or more, speech can no longer keep up, so gaps are accepted and the player offers Web Speech.
  - **Prefetch:** it counts queued audio in seconds, not in units. Synthesis keeps running while less than 12 s of audio is queued, and never with fewer than 2 units ready. Counting units fails on a run like "long, short, short, long": the two short ones leave too little audio queued to cover the next long one.
- **Not chosen:**
  - sherpa-onnx WASM: three times the download, 768 MB of wasm reserved up front, and no threads. It rejects raw Piper `.onnx` files without a metadata patch. Its two glue files both declare `Module`, so it needs `eval` or two workers.
  - piper-tts-web: no rate control, hard-coded CDN defaults, and a phonemizer it re-creates on every sentence. Its 1.0.5 release arrived two years after 1.0.4, during the worm window.
- **Kokoro** was not benchmarked (skipped for time). It stays a P1 option (T59).

## Licences

- onnxruntime-web is MIT.
- The `phonemizer` package says Apache-2.0, but it bundles espeak-ng, which is GPL-3.0. That is true of every candidate's phonemizer. `kokoro-js` 1.2.1 bundles the same package. ADR-0005's note stands: no effect while Wanheda is personal. If Wanheda is ever distributed, the GPL question has to be answered first; an alternative is a lexicon frontend (sherpa ships `lexicon-en-us.txt`).
- **Voices have their own licences.** `en_US-lessac-medium`'s MODEL_CARD points to the Blizzard 2013 Lessac dataset, which is research-only and excludes "voice synthesis products or services". That is fine for a private dashboard. The voice manager shows every voice's licence (V46).

## Consequences

### In 6 months

- Speech starts in under a second inside an open reader, and works offline after one voice download (about 63 MB per medium voice).
- English only: `phonemizer` 1.2.1 ships English espeak data. Another language needs piper-phonemize's 18 MB data file or a newer phonemizer build.
- The speech worker holds 150–600 MB while it lives.

### In 2 years

- Cross-origin isolation, if it ever comes (for example `COEP: credentialless` after the Phase 7 embed test), speeds speech up about 3× with no code change.
- On desktop (Phase 8), native sherpa-onnx or ONNX Runtime replaces the worker behind the same `TtsEngine`.
- The pinned `onnxruntime-web` must be bumped by hand. Each bump repeats the supply-chain read and the `eval` check.

## Alternatives considered

- **Sherpa-onnx WASM**: fastest model load (about 1.6–1.9 s), many languages, also runs Kokoro. Rejected for its size, memory, lack of threads and `eval`-or-two-workers glue.
- **piper-tts-web**: rejected (see Decision).
- **Pre-warm on app start**: keeps about 150 MB all day for a feature used in the reader. Rejected by the owner.
- **Relax the target to cold < 6 s**: every session's first press would wait. Rejected by the owner.
- **Isolate the app now for threads**: breaks YouTube embeds, and in a client-routed app it can't be limited to one route.

## Revisit when

- The Phase 7 embed test shows `COEP: credentialless` keeps YouTube working. Then turn threads on.
- The owner wants a non-English voice.
- A Piper-quality engine without a GPL phonemizer appears, or Wanheda is distributed.
- An `onnxruntime-web` or `phonemizer` update is needed for a bug or for security.
