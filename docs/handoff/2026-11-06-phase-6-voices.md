# Hand-off — Phase 6: Voice — CP3, the voices (T55)

| | |
|---|---|
| Date | 2026-11-06 |
| Phase / checkpoint | Phase 6, CP3 = T55 voices done |
| Branch | `phase-6/voices` (off `main` at `cad5cac`; forged-commit check on `54a7f0c..origin/main` clean, 5 commits) |
| Open PR | opened after the Reviewer peer's LGTM (see Review state) |
| Previous hand-off | docs/handoff/2026-11-06-phase-6-speech-core.md (also: 2026-11-06-phase-6-reader-prefs-sync.md, PR #39) |

## State in one paragraph

The voices can now be managed from Settings → Voices. A pinned catalog of 14 English single-speaker Piper voices can be filtered by language, quality and "on this device". Each row shows its size and its MODEL_CARD licence, and voices that aren't cleared for commercial use are flagged, including those fine-tuned from Lessac or Ryan. Downloads stream with progress, can be cancelled, and are checked by size and sha256 before anything is kept. Delete goes through an Undo toast. The default voice and speed are device prefs, and the speech store reads them at each play. The island has a `transfer` activity for this tab's downloads. The Piper worker now phonemizes with each voice's own espeak voice (`en`, `en-us`, `en-gb-x-rp`), so the British voices get British phonemes.

## Done this session

- **Verified on start:** `main` = `origin/main` = `cad5cac` (#38 speech core and #39 reader prefs sync both merged); forged-commit check clean; tripwire clean; typecheck clean; tests 1043/1043 (the first run had a load flake, the rerun was clean).
- **Catalog (re-checked at the pinned revision `b4e358f`):**
  - Each model's size equals its LFS size and its `voices.json` size, and its sha256 is the LFS oid.
  - Each config was downloaded and hashed. Its size, git blob sha1 and md5 match the tree and `voices.json`.
  - Lessac's T54 pins are unchanged. `main` has moved to `e7229f7` (2026-11-02); the catalog stays on `b4e358f`.
  - The 14 voices:
    - US: lessac medium|high, ljspeech medium|high, kristin, norman, joe, kathleen-low, ryan;
    - UK: alba, cori medium|high, northern_english_male, southern_english_female-low.
  - Left out: the multi-speaker voices (they need a speaker picker), and voices whose card says only "License: See URL" (amy, alan, danny, kusal, jenny_dioco).
  - The licence lineage comes from each card's "Training" line. joe, ryan, alba and northern_english_male are fine-tuned from Lessac, whose data is research-only. kathleen and southern_english_female are fine-tuned from Ryan (CC BY-NC-SA). All of these are flagged, and a test enforces the rule.
- **`lib/speech/`:**
  - `voices.ts`: V46 layout `wanheda-voices/<id>/`. T54's flat copy is still read, so the owner's Lessac on :3000 shows as installed. `installFor` streams with progress and removes the folder on any failure or abort. Also `removeVoice`, `installedVoices` and `hasPartial`.
  - `prefs.ts`: `voicePref` and `ratePref` (device prefs), with `SPEEDS`.
  - `piper-ids.ts`: the config parser reads `espeak.voice`, defaulting to `en-us`, and refuses voices the bundled phonemizer lacks, or a `phoneme_type` other than `espeak`.
  - `piper.worker.ts`: phonemizes with `config.espeak.voice`, and handles `drop`.
  - `piper.ts`: `drop(voice)`. A deleted voice isn't re-warmed. Speech still on it fails its next unit and carries on in Web Speech (the T54 fallback).
  - `store.ts`: `play` reads the voice and rate prefs, with an optional `{ voice }` override for the sample. `setRate` writes the pref. `setVoice` writes the pref; the change applies from the next play.
- **UI:**
  - `components/settings/voice-manager.ts` (zustand, one per tab):
    - downloads run one at a time, each holding the Web Lock `wanheda-voice:<id>` (a second tab says "Another tab is downloading this voice");
    - progress is throttled to 150 ms, and a failure stays with its reason;
    - the first voice on a device becomes the voice pref, and deleting the pref'd voice moves the pref to the next voice here;
    - delete waits on its Undo toast, and the files go only on expiry;
    - a BroadcastChannel makes other tabs rescan;
    - partial folders left by a closed tab are swept;
    - `beforeunload` asks first while a download runs;
    - `navigator.storage.persist()` is requested on download.
  - `components/settings/voices-section.tsx`: the section is in the rail under Preferences, with the note "Kept on this device".
  - `components/island/transfer-activity.tsx`: a ring with the percent. The card shows MB received, Voices and Cancel, or Retry and Dismiss after a failure. The island subscribes to the download ids only, so a progress tick doesn't re-render it.
- **Tests (new):**
  - `lib/speech/voices.test.ts`, on a fake OPFS and a fake Hugging Face: progress, tamper, wrong size, 404, abort mid-stream, the flat read, remove, partial, the catalog's shape, pins and flags;
  - `components/settings/voice-manager.test.ts`: queue, cancel (queued and running), failure and retry, the first-voice default, Undo before delete;
  - `lib/speech/prefs.test.ts`;
  - two config cases in `piper-ids.test.ts`.
- **Gates:** typecheck clean; tests **1066/1066** across 101 files (after the review nits); tripwire clean; `bun run build` passes. ESLint on the touched files leaves only intentional runtime guards (`navigator.storage?.…`, which is absent in workers and older browsers), plus T54's pre-existing findings.
- **Browser check** on a production build served on :3044 (stopped afterwards), a separate origin with its own empty OPFS:
  - zero console errors;
  - downloaded *Southern English female* (63.1 MB, about 2.5 min): the row and the island pill and card showed progress (e.g. "19.3 MB of 63.1 MB · 30%"), the checksum passed, it landed in `wanheda-voices/<id>/` and became the Default;
  - Kathleen, queued behind it, was cancelled cleanly;
  - "Hear" played the sample on **Piper**, with 0 `speechSynthesis.speak` calls, in 11.2 s cold and 7.8 s warm. That is the en-gb-x-rp phonemes at 16 kHz;
  - delete → Undo kept the voice. Delete → expiry removed the folder at 9.0 s, and Settings fell back to "The browser's own voice".
  - The expiry check used a stand-in folder of zero-filled files at the pinned sizes, planted after the owner pressed Undo on the real one. My probe had already removed the real files by hand; :3044 now holds no voice.

## Decisions made (Builder calls)

- **Settings → Voices, not a Voice app.** T55 allows either. The mini window and the speech card are T57.
- **14 voices, not all 38 English ones.** Only single-speaker voices, and only cards that name their terms.
- **Lineage flags.** A CC0 or CC BY dataset fine-tuned from Lessac or Ryan is still flagged, with a note naming the base voice.
- **Serial downloads.** Each one holds up to 114 MB in memory to digest it, which is too much at once on a phone.
- **A voice change applies from the next play**, not mid-speech: the Piper driver is bound to one voice.
- **The island `transfer` activity is voice-download-specific for now** (`transferActivity(id)`). Generalise it when another kind of transfer exists.

## Known problems and risks

- **The owner's dev server on :3000 (PID 40452) has a stale SSR module.** It loaded T54's `voices.ts` (from /reader) before this branch existed, and now throws "voiceSize is not a function" on /settings SSR, falling back to client rendering ("2 Issues" badge). The production build renders clean. **Restart the dev server.**
- **A download is in memory until it's checked.** Closing the tab loses it: the manager asks on `beforeunload`, and the next scan sweeps the partial folder.
- **The island shows downloads from this tab only.** Other tabs rescan their lists when one finishes.
- **No engine-order pref yet.** V45 says "fallback order = owner pref". T55 doesn't list it, so it's left for T57's controls.
- The T54 risks still stand: no Web Speech watchdog, and English only.

## Next steps (in order)

1. The PR is open (Reviewer LGTM with nits, all taken). The Reviewer does the tip check on the push; the user merges.
2. **Stop.** T56 (CP4, read-along) starts in a fresh session.
3. Still open with the user, not to act on unasked:
   - the Phase 5 owner run;
   - eager remote images in the md book;
   - pdf.js painting in a worker;
   - asking before jumping to another device's newer place;
   - the stale remote branch `phase-5/reader-core`;
   - T52 and T44;
   - the reader-prefs owner check (#39).

## Files to stage (by name)

`SPEC.md`, `lib/speech/voices.ts`, `lib/speech/voices.test.ts`, `lib/speech/prefs.ts`, `lib/speech/prefs.test.ts`, `lib/speech/piper-ids.ts`, `lib/speech/piper-ids.test.ts`, `lib/speech/piper-protocol.ts`, `lib/speech/piper.ts`, `lib/speech/piper.worker.ts`, `lib/speech/store.ts`, `components/settings/voice-manager.ts`, `components/settings/voice-manager.test.ts`, `components/settings/voices-section.tsx`, `components/settings/settings-board.tsx`, `components/island/island.tsx`, `components/island/transfer-activity.tsx`, `docs/handoff/2026-11-06-phase-6-voices.md`, `docs/handoff/LATEST.md`.

## Env / services touched

None in the repo. Downloads from huggingface.co: the 14 catalog configs and model cards into the session scratchpad (verification only), plus one voice into Chrome's OPFS for origin localhost:3044, since removed.

## Review state

Reviewer peer (wanheda-2a), one pass on the uncommitted diff: **LGTM with nits**, no FIX. It spot-checked alba-medium and kathleen-low against HF at `b4e358f`, and both matched. All four nits were taken:
1. **The partial sweep could race another tab's install.** `hasPartial` was read outside the lock. **Fixed:** it's checked again under the lock before removing.
2. **A cancel during the model write still kept the voice.** **Fixed:** `signal.throwIfAborted()` after `keep(model)`, so the folder is removed. New test: abort inside the model's `.part` close leaves no folder.
3. **During the Undo window the row showed a dead Download.** **Fixed:** it shows **Keep**, which closes the toast (that close is what takes the delete back). New manager test.
4. **`removeVoice` swallows errors, so a refused delete looked done.** **Fixed:** after removing, `commitRemove` checks `isInstalled` and `hasPartial`. If the files remain, it says "not deleted" and rescans. New manager test. The unreachable BUSY check on the waiting lock is gone.

### Reviewer prompt

```text
You are the REVIEWER session for Wanheda at D:\Vxrcel\wanheda. Use the diff-reviewer skill;
read-only. One pass, bugs and edge cases only, verdict LGTM / LGTM with nits / FIX, sent to the
Builder. Your LGTM is not the user's approval.
Target: the uncommitted T55 diff on branch phase-6/voices (files listed in
docs/handoff/2026-11-06-phase-6-voices.md).
Check: voices.ts install/cleanup/flat-layout read; catalog pins (spot-check 2 against HF at
b4e358f) and non-commercial flags; voice-manager.ts queue/cancel/lock/Undo races; store prefs
read at play; worker espeak voice + drop; island transfer activity.
Context: SPEC V45/V46 (T55 amendment), the hand-off above.
```

### Builder prompt (Phase 6, CP4)

```text
You are the BUILDER session for Wanheda at D:\Vxrcel\wanheda (lean mode, one checkpoint,
no worktrees; rules in CLAUDE.md and docs/handoff/README.md).
Start from docs/handoff/LATEST.md → docs/handoff/2026-11-06-phase-6-voices.md; verify
(git, tripwire, typecheck, tests). PR merged? Forged-check the merge range before pulling.
Next: T56 `phase-6/read-along` (SPEC V48): reader "play from here", sentence highlight,
follow / follow-off + arrow pill, saved place follows the voice, play before text.json,
Notes "read note". The speech store and voice prefs are in lib/speech/.
```
