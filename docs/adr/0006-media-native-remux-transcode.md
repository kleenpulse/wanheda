# ADR-0006: Media plays native first, remux second, transcode last

| | |
|---|---|
| Status | Accepted |
| Date | 2026-11-04 |
| Deciders | Isaac Gideon (owner) |

Source: FRD.md D6, §6.5, Phase 7, §11.

## Context

Wanheda plays local music and video, URLs and embeds, and R2 uploads. Chromium (and so Electron) plays most common codecs. It does not play AC3, E-AC3 or DTS, and HEVC depends on hardware. Many local videos are in MKV containers that Chromium will not open even when the codecs inside are fine. *(T60, 2026-11-07: no longer true for MKV with H.264 + AAC, which Chrome now plays natively. The remux is for containers Chrome still refuses, such as MPEG-TS.)*

Full transcoding in the browser (ffmpeg.wasm) is slow and limited to about 1–2 GB.

## Decision

A codec probe runs before play, then:

1. **Native:** play in Chromium wherever possible.
2. **Remux:** formats that won't play (mostly MKV) are remuxed in the browser with **Mediabunny** (MPL-2.0, WebCodecs, streams large files).
3. **Transcode:** only codecs Chromium cannot decode (AC3, DTS, some HEVC) are transcoded. ffmpeg.wasm on the web, a native ffmpeg or `mpv` sidecar on desktop.
4. Otherwise a clear "cannot play" message with the reason.

The player UI is **Video.js v10** (`@videojs/react`, Apache-2.0), behind our own `<MediaSurface>` component. *Amended 2026-11-07 (T60):* the first draft chose Vidstack and planned to swap once Video.js v10 was GA. v10 shipped GA on 2026-10-01, and Vidstack is now in security-only maintenance, so Phase 7 starts on v10. The details and measurements are in [ADR-0013](0013-media-engines.md).

*Also from T60:* Chrome now plays MKV with H.264 + AAC natively, so the remux rung is for containers it refuses, such as MPEG-TS. The probe must check the codecs of the tracks that will play, not just the container: an AC3 MKV plays as silent video with no error. A `<video>` element plays only the default tracks, so choosing another track means a remux.

## Consequences

### In 6 months

- ~~An MKV with H.264 + AAC plays after a fast remux, with no full transcode.~~ T60: it plays natively. Containers Chrome refuses (MPEG-TS) play after a fast remux, with no full transcode.
- The player choice is contained in `<MediaSurface>`.

### In 2 years

- ~~The Video.js v10 swap touches one component.~~ No swap: Phase 7 starts on v10. A future major version still touches only `<MediaSurface>`.
- Desktop covers the hard cases with native ffmpeg or mpv ("plays anything" mode).

## Alternatives considered

- **Always transcode.** Slow, battery-heavy, and hits the ffmpeg.wasm size limit.
- **react-player.** Fine for embeds, too thin for a local library player.
- ~~**Start on Video.js v10 now.** It was not GA during research. Check again at the start of Phase 7.~~ Checked at the start of Phase 7: GA, adopted (ADR-0013).

## Revisit when

- ~~Video.js v10 reaches GA (check at the start of Phase 7).~~ GA on 2026-10-01; adopted in Phase 7 ([ADR-0013](0013-media-engines.md)).
- Chromium adds AC3/DTS support, or HEVC becomes reliable without hardware.
- macOS or Linux desktop builds are needed (more codec testing).
