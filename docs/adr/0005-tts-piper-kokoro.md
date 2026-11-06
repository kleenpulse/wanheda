# ADR-0005: TTS is Piper everywhere, with Kokoro as the quality option

| | |
|---|---|
| Status | Accepted; web engine chosen in [ADR-0012](0012-tts-web-engine-onnxruntime-web.md) (2026-11-06) |
| Date | 2026-11-04 |
| Deciders | Isaac Gideon (owner) |

Source: FRD.md D5, §6.7, Phase 6, §11.

## Context

Wanheda reads PDFs, Markdown, EPUBs and notes aloud, offline. companion-tts already has a tested TypeScript speech pipeline (text transform, chunk queue, Web Audio player, read-along highlight). Its Piper engine is in Rust, which does not fit an Electron app (ADR-0001).

## Decision

- **Web:** Piper voices run in the browser on onnxruntime-web/WASM, in a Web Worker. Candidates: `sherpa-onnx` WASM (Apache-2.0, runs Piper and Kokoro) and `@mintplex-labs/piper-tts-web` (MIT). Voices are cached in OPFS. The Phase 6 spike (Eta) picks one and records it in a new ADR.
- **Desktop:** `sherpa-onnx` runs natively from the Electron main or utility process. It is much faster than WASM.
- **Quality mode:** Kokoro-82M through `kokoro-js` on WebGPU, when the machine can run it.
- **Cloud fallback (optional):** the ElevenLabs/Mistral server route from admin_shadow-garden.
- **Zero-download fallback:** the Web Speech API.
- All engines sit behind one `TtsEngine` interface.
- **Reuse from companion-tts:** `transform.ts` (Markdown → speakable text, sentence packing at about 420 characters), `queue.ts` (prefetch for gapless chunks), `player.ts` (Web Audio graph) and `RevealText` / `revealEdge`. This is the owner's own code, so copying it is fine.

### License note

The espeak-ng phonemizer that Piper (and most Kokoro pipelines) use is **GPL-3.0**. Upstream Piper moved to `OHF-Voice/piper1-gpl` (GPL-3.0) after `rhasspy/piper` was archived on 2025-10-06. For a personal app that is never distributed, this has no effect. If Wanheda is ever shipped to others, the TTS engine must run as a separate process with its own license and source offer, or the whole app becomes GPL-3.

## Consequences

### In 6 months

- Any text in the app can be read aloud offline after one voice download.
- Read-along and the chunk queue are ported code with tests, not new work.

### In 2 years

- Engines can be swapped or added behind `TtsEngine` without touching the Reader or Notes.
- The GPL question stays closed only while Wanheda stays personal.

## Alternatives considered

- **Web Speech API only.** Voice quality varies by OS. No control over voices.
- **Cloud TTS only.** Costs money, needs the network, and sends private text to a third party.
- **Port the Rust Piper code.** It does not fit Electron.

## Revisit when

- The Phase 6 spike shows Piper WASM is too slow (time to first audio over 1.5 s).
- Wanheda is ever distributed (FRD §11 open question 6).
- A Piper-quality engine without a GPL phonemizer appears.
