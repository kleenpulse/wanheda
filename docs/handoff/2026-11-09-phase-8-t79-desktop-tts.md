# Hand-off — Phase 8: Desktop — T79 native speech

| | |
|---|---|
| Date | 2026-11-09 |
| Phase / checkpoint | P8 CP6: T79 native Piper (sherpa-onnx) built and checked in preview and in the installer build; T79 ticked |
| Branch | `phase-8/desktop-tts` (off `main` at `3d7423a`), Reviewer LGTM, committed for a PR |
| HEAD at start | `3d7423a` — Merge pull request #83 from kleenpulse/phase-8/desktop-files |
| Previous hand-off | docs/handoff/2026-11-09-phase-8-t78-desktop-files.md |

## State in one paragraph
T78 merged as PR #83 (`3d7423a`) after wanheda-87's LGTM with nits, push check and main check. That follows the owner's standing go-ahead for this run: on LGTM, commit, push, PR, merge, then the next task. T79 is built.

On desktop, read-aloud runs Piper in sherpa-onnx in its own utility process, about 13× faster than real time:
- **Phonemes** are made in the page (a phoneme-only worker).
- **Voices** are the ones already in the page's OPFS, handed to main once and kept only if both files match the catalog's size and sha256. Nothing is downloaded twice on the metered link.
- **Fallback:** any failure other than a stop switches the session back to WASM Piper.

Reviewer wanheda-87: LGTM with nits (both taken). **After T79 merges, this run stops:** T80 bundles ffmpeg (about 126 MB), which needs the owner's own yes on the metered link.

## Done this session
- **Desktop:**
  - `tts-model.ts` (pure): `parseTtsConfig`, `metadataTail`, `tokensText`, `isVoiceId`, `parseSynthRequest`.
  - `tts-catalog.ts`: sizes and sha256 per voice, kept equal to `lib/speech/voices.ts` by a test.
  - `tts.ts`: install with checks, an atomic write of the derived model plus `tokens.txt` plus config to `userData/voices/<id>/`, the utility process lifecycle, and the speed log.
  - `speech/speech-process.ts`: sherpa with 2 threads, `silenceScale` 1, `enableExternalBuffer: false`, one voice loaded at a time.
  - `bridge.ts`: `tts` channels plus `parseTtsInstall`.
  - `preload.ts`: `window.wanheda.tts`.
  - `main.ts`: handlers (main window only), `speechDir()`, and the speech process stopped on quit.
  - Packaging:
    - `scripts/bundle.ts` `bundleSpeech`;
    - `stage.ts` copies sherpa's two packages into `.stage/speech`;
    - `verify.ts` `verifySpeechDir` (+ test) runs in both stage and build;
    - `dev.ts`;
    - `electron-builder.yml` puts `speech` in `extraResources`.
  - `package.json`: `sherpa-onnx-node` and `sherpa-onnx-win-x64` 2.0.1 as devDependencies. They came from Bun's cache (the T74 spike), so nothing was downloaded.
- **Web:**
  - `lib/speech/phoneme.worker.ts`;
  - `lib/speech/piper-native.ts` (`nativePiper`, `synthPreferNative`);
  - `piper-ids.ts` `phonemeCodepoints` (+ test);
  - `store.ts` `PiperDriver` prefers native;
  - `prewarm.ts` hands the voice over on desktop (the WASM model never loads there);
  - `voice-manager.ts` delete drops the native copy;
  - `lib/platform/desktop.ts` `tts` types.
- **Docs:** SPEC T79 ticked, README "Native speech", CHANGELOG entry.

## Verification (actual results)
- tripwire clean. `typecheck` and `desktop:typecheck` clean. Tests: 166 files, 1667 passed. ESLint on new and changed files: 0, apart from two existing `store.ts` findings that are also on `main`.
- **Byte checks against the T74 spike** (the real lessac files from the spike's scratchpad):
  - our metadata tail plus the catalog model is byte-identical to the spike's `lessac-meta.onnx` (`ea793a648ce0…`, 131 bytes);
  - `tokensText` matches the spike's `tokens.txt`.
- **Preview** (demo):
  - The spike's lessac files were copied into the preview's OPFS through a `wanheda-file:` root, with no download.
  - Read-aloud on a note handed the voice over: the log says `speech: kept voice en_US-lessac-medium`, and the derived model's sha256 is `ea793a…`.
  - The note was read 3 times, 5 sentences each, with the island showing "reading, sentence 4 of 5" and so on.
  - On quit the log said `speech: 15 units, 22.2 s audio in 1.7 s, RTF 0.076`.
  - The preview's derived voice, the temporary root and the demo record were deleted afterwards. The OPFS copy of lessac stays in the preview profile.
- **Installer** (`desktop:build`):
  - `resources/speech` holds the bundle and the two sherpa packages, and `verifySpeechDir` passes.
  - The first build also packed sherpa into `app.asar.unpacked` (23 MB, a duplicate). Fixed by making the packages devDependencies.
  - The rebuild has no `app.asar.unpacked`; `resources/server` and `resources/speech` both verify, and the installer is 133.6 MB (127.7 MB before T79).
  - `bun install --cwd desktop --frozen-lockfile --ignore-scripts`: no changes.

## Review (wanheda-87): LGTM with nits, both taken
- **Nit 1:** `config.json` now records `sourceSha256` (the catalog model it was made from). `has()` and `readConfig` count a voice only while that equals `VOICE_FILES[voice].model.sha256`, so a re-pinned catalog voice is handed over again.
- **Nit 2:** `install` is async. It hashes in 8 MB steps with a `setImmediate` between them and writes with `fs/promises`, so no window freezes on a voice's first native use.
- **Preview after the nits:** read-aloud logged `kept voice` again, then `5 units, 7.2 s audio in 0.6 s, RTF 0.078`; `config.json` held `sourceSha256: 5efe09…`. The preview voice was deleted afterwards.

## Decisions made
- **Phonemes stay in the page** (`phonemizer` and its GPL espeak-ng, as in ADR-0012). The shell gets NFD code points only.
- **The voice comes from the page's OPFS copy**, checked again in main against the catalog digests. No second download.
- **Native is tried first in `PiperDriver`.** The first non-abort failure marks it broken for the session, and WASM Piper takes over (V73). There's no separate engine id, so the Sound and Voices settings stay as they are.
- **Speed log:** one line per process lifetime (units, audio seconds, synth seconds, RTF), for T82.

## Known problems and risks
- **Not checked:**
  - a crash of the speech process mid-read (the fallback path is unit-level only);
  - other voices;
  - the installed app reading aloud (the installer was built and verified, not installed and run).
- **Two lint findings** in `store.ts` (`log.mark` in an arrow, and a truthy check) exist on `main` too, so they aren't from this branch.
- **Still open:** T44 (Phase 4 exit), 7c (unplugged drive), the owner's "Wanheda Desktop" GitHub OAuth app.

## Next steps (in order)
1. Merge the T79 PR once CI is green (the owner's standing go-ahead for this run), then the Reviewer's push and main checks.
2. **Stop and ask the owner before T80:** bundled ffmpeg is about 126 MB to download (ADR-0014). Over the metered-link line, so it needs their own yes.

## Files to read first
- desktop/tts.ts, desktop/tts-model.ts, desktop/speech/speech-process.ts, desktop/scripts/{stage,verify,bundle}.ts, desktop/electron-builder.yml
- lib/speech/piper-native.ts, lib/speech/phoneme.worker.ts, lib/speech/store.ts (`PiperDriver`)

## Env / services touched
- No new env vars. No downloads (sherpa from Bun's cache; the voice from the T74 scratchpad).

## Review state
- Branch / PR: `phase-8/desktop-tts` / opened after LGTM.
- Checkpoint 1 (diff): LGTM with nits from wanheda-87; both nits taken; LGTM stands.

### Reviewer prompt (T79)

```text
You are the REVIEWER for Wanheda (D:\Vxrcel\wanheda). Use the diff-reviewer skill; read-only, one pass.
Review the uncommitted diff on phase-8/desktop-tts (T79 native speech). Read docs/handoff/LATEST.md → 2026-11-09-phase-8-t79-desktop-tts.md, SPEC T79, V45, V46, V67, V73, ADR-0014 (native Piper), desktop/README.md.
Bugs and edge cases only; verdict LGTM / LGTM with nits / FIX, sent to the Builder (wanheda-7a).
Weigh hardest: the voice hand-over and digest checks, the metadata/tokens derivation, IPC parsers, the speech process lifecycle and fallback to WASM, packaging (speech/ folder, verifySpeechDir, no duplicate in app.asar).
```
