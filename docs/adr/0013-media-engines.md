# ADR-0013: Media engines: Video.js v10, Mediabunny streaming for remux and gapless music, `music-metadata` in a worker

| | |
|---|---|
| Status | Accepted |
| Date | 2026-11-07 |
| Deciders | Isaac Gideon (owner) |

Source: FRD.md D6, §6.5, Phase 7. Refines [ADR-0006](0006-media-native-remux-transcode.md). SPEC T60, V51–V53, V58–V60.

## Context

ADR-0006 set the order (native, then remux, then transcode) and left three things open: the player UI (Vidstack, or Video.js v10 once GA), how a remux reaches the player, and how music plays gapless. The Phase 7 spike (2026-11-07, Eta) measured all three on the owner's laptop, in Chrome on Windows, with a harness kept outside the repo.

### Packages read before install

Every tarball was fetched by hand from the registry and checked against its sha512 integrity. Each was scanned with the 2026-10 worm indicators and for `eval`, `new Function`, Node-only APIs and hard-coded network calls. The newest release at least 7 days old was taken:

| Package | Version | Licence | Notes |
|---|---|---|---|
| `@videojs/react` | 10.2.0 (2026-10-22) | Apache-2.0 | Published by GitHub Actions with provenance. Its tree: `@videojs/{core,media,store,utils,spf,native-hls-video}` 10.2.0, `video.js` 10.2.0, `react-compiler-runtime` 1.0.0, `signal-polyfill` 0.2.2. The provider packages (YouTube, Vimeo, hls.js, DASH, Mux Data and others) are optional peers, so none is installed until a task needs it. |
| `mediabunny` | 1.65.0 (2026-10-30) | MPL-2.0 | One maintainer, GitHub Actions with provenance. Its only dependencies are two `@types` packages. |
| `music-metadata` | 12.3.3 (2026-10-31) | MIT | One maintainer (Borewit). Its tree has 14 small packages: `strtok3`, `token-types`, `file-type`, `debug`, `ms` and others. |

All clean:
- No install-time scripts. The `prepare` and `prepublishOnly` entries run on the publisher's machine, and `trustedDependencies: []` blocks scripts anyway.
- No worm indicators, no `eval`, no `new Function`, no telemetry.
- Video.js only fetches HLS segments, VTT files and FairPlay licences, always from the media's own URL. Its `stream.mux.com` reference only checks a URL to pick a player type.
- The Node-only files (`mediabunny/node`, strtok3's `FileTokenizer`) are entry points the browser build never imports.

The Video.js 10.2.0 docs also say Vidstack is now in security-only maintenance.

### Measurements

| What | Result |
|---|---|
| Video.js v10 (React 19.3.1, video preset, default skin) | Mounted in 115 ms. First frame 158 ms after the source was set. The ref is the real `HTMLVideoElement`. Minified and gzipped, it costs about 75 KB of JS on top of React, plus 10 KB of CSS. The skin takes tokens through `--media-accent-color`, `--media-font-family`, `--media-border-radius` and `--media-scale-unit`. 196 files are marked `"use client"`. |
| 2 GB MKV (H.264 + AAC, 1080p, 15 min) | **Chrome plays it natively** (`canPlayType` answers "maybe"), with first frame in 145 ms. |
| The same MKV, remuxed by Mediabunny in a worker into fragmented MP4, fed to MSE through `MediaSource.handle` | Probe 34 ms. First fragment appended 85 ms after the click, first frame 138 ms. A 30 s look-ahead kept memory flat, the main-thread heap stayed at 4 MB, and no frames were dropped while playing. Seeking to 600 s (cancel, then re-remux from the keyframe before it) took 295 ms to the first frame. `copy: { mode: "forced" }` means a track is copied or dropped, never transcoded. |
| MPEG-TS (H.264 + AAC) | Not playable natively (`DEMUXER_ERROR_COULD_NOT_OPEN`). Through the remux, first frame in 293 ms, audio included. |
| MKV with H.264 + **AC3** | **Native play runs silently, with no error:** 0 audio bytes decoded. `AudioDecoder` and MSE both reject `ac-3`. |
| Gapless: a 20 s chirp cut into two 10 s files at exactly 441,000 samples, in WAV, MP3 (LAME), AAC (m4a), FLAC and Opus | Chrome's `decodeAudioData` trims encoder delay and padding exactly for every format. But it decodes a whole track at once: one of the owner's 67-minute mixes would take about 1.55 GB. Mediabunny's `AudioBufferSink` streams in chunks of at most 4,096 frames. It trims the leading delay (as negative timestamps), but its MP3 duration still includes the tail padding. Clipping the stream to `[0, duration]`, minus the MP3 tail from the LAME extension of the Xing/Info frame (`max(0, padding − 529)`, 529 being the decoder delay), gives exactly 441,000 samples for every format. The error at the seam is then 0 for WAV and FLAC, and 0.015 for MP3, the same as the codec's own noise elsewhere in the file. AAC has 0.031 at the seam against 0.010 elsewhere: the same seam error `decodeAudioData` gives, so it comes from the codec, not the trim. |
| Hardware media keys, with sound from Web Audio only (no media element) | Play, pause and next all reached `navigator.mediaSession` handlers, **once Chrome was Windows' current media session**. While a YouTube tab played in Brave, the keys went to Brave even with Chrome focused. |
| `music-metadata` `parseBlob` in a worker, on the owner's Music folder | 26 of 26 files parsed, 0 bad. 13 ms per track (78 tracks/s), slowest 22 ms. Durations come from the headers (the 67-minute mix reads 4048.7 s, matching ffprobe). 13 files have no artist or album tags. |

## Decision

- **Player UI: Video.js v10** (`@videojs/react`, exact pin), not Vidstack. It's GA and Vidstack is in maintenance. Only `<MediaSurface>` imports it, through a dynamic import on `/media` and in the mini player. The skin gets its colours from role tokens through the `--media-*` properties.
- **Ladder: every chosen track must pass, not just the container.**
  - Native if `canPlayType` (or the MSE type check) accepts the container and the default tracks' codecs. A `<video>` element plays only the default tracks (`audioTracks` is still behind a flag in Chrome), so choosing a non-default track means a remux.
  - Remux if the container fails but every codec is playable.
  - Transcode (P1) if a codec fails.
  - Otherwise "can't play", naming the codec and the track.

  The container check alone is not enough: it lets an AC3 MKV play as silent video with no error.
- **Remux output: fragmented MP4 streamed into MSE from a worker** (`MediaSource.handle`), not a finished file in OPFS. Play starts within about 0.3 s and memory stays bounded. A seek beyond what's buffered restarts the remux from the keyframe before the seek point. Remuxed bytes are never stored, so no OPFS cache is needed. The finished-file path was not measured, because streaming made it unnecessary.
- **Gapless music: Mediabunny `AudioBufferSink` streaming, clipped to each track's exact duration** (the track's duration minus `max(0, padding − 529)` from the LAME extension for MP3; a zeroed or missing LAME extension gives 0). It's scheduled on the AudioContext clock, so track n+1's first sample lands on track n's last. Not `decodeAudioData` on whole tracks, because of memory.
- **Tags: `music-metadata` in a worker.** Index without reading durations from the audio (the headers carry them). The library falls back to the file name for the title, and groups untagged files under "Unknown artist".
- **Media keys: Media Session on the page, whatever the sound source.** Web Audio alone is enough, and no `<audio>` element is needed. Windows gives the keys to one app's session at a time. A web page can't take them from another app that is playing, so the exit run tests with no other media app playing. Phase 8's Electron global shortcuts remove this limit.

## Consequences

### In 6 months

- `/media` loads about 85 KB gzipped for the player, only on its own routes. The shell does not grow.
- MKV and MP4 with ordinary codecs play natively. MPEG-TS and odd MKVs play through the remux in under 0.3 s. AC3 tracks are caught by the probe, not discovered as silence.
- Music plays gapless with flat memory, even for hour-long mixes.
- Mediabunny is MPL-2.0. That's file-level copyleft, and we don't modify its files, so it doesn't affect our code.

### In 2 years

- Video.js 10.x minor releases come often (10.0 to 10.3 in five weeks). Each bump is read like any package. `<MediaSurface>` keeps a breaking change in one file.
- If Chrome adds AC3, the ladder picks native for it without code changes, because it asks the browser at run time.
- Desktop (Phase 8) adds native transcode and global media keys behind the same ladder.

## Alternatives considered

- **Vidstack.** In security-only maintenance. Video.js v10 is its successor.
- **Remux to an OPFS file, then play it.** Simpler seeking, but play waits for the whole remux, and the bytes would need an OPFS cache with eviction.
- **`decodeAudioData` on whole tracks.** Exact trimming with no extra code, but an hour-long track costs about 1.5 GB of memory.
- **Sound through an `<audio>` element fed by a `MediaStreamAudioDestinationNode`, to win the media keys.** Not needed: Web Audio alone gets the keys.

## Revisit when

- Video.js ships a breaking 11.x, or a provider package is first needed (YouTube, Vimeo, hls.js).
- Chrome changes how it handles MKV, or adds AC3, E-AC3 or DTS.
- A gapless album sounds wrong in the exit run (the trims are checked on test files, not real albums).

## Amendment (2026-11-08, T72)

The video player's controls are now the app's own chrome (`components/media/video-chrome.tsx`), not Video.js's stock skin. The skin couldn't hold what the redesign needed inside full screen: the resume question, menus, an episode rail, an autoplay card and captions that move above the controls. Video.js stays as the host of the `<video>` element (`VideoPlayer` + `Video` in `media-surface.tsx`, still the only file that imports it), so going back to its skin, or adding its HLS/DASH providers later, is still a change to that one file. SPEC V51 and V65 carry the details.
