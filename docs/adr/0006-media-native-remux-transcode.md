# ADR-0006: Media plays native first, remux second, transcode last

| | |
|---|---|
| Status | Accepted |
| Date | 2026-11-04 |
| Deciders | Isaac Gideon (owner) |

Source: FRD.md D6, §6.5, Phase 7, §11.

## Context

Wanheda plays local music and video, URLs and embeds, and R2 uploads. Chromium (and so Electron) plays most common codecs. It does not play AC3, E-AC3 or DTS, and HEVC depends on hardware. Many local videos are in MKV containers that Chromium will not open even when the codecs inside are fine.

Full transcoding in the browser (ffmpeg.wasm) is slow and limited to about 1–2 GB.

## Decision

A codec probe runs before play, then:

1. **Native:** play in Chromium wherever possible.
2. **Remux:** formats that won't play (mostly MKV) are remuxed in the browser with **Mediabunny** (MPL-2.0, WebCodecs, streams large files).
3. **Transcode:** only codecs Chromium cannot decode (AC3, DTS, some HEVC) are transcoded. ffmpeg.wasm on the web, a native ffmpeg or `mpv` sidecar on desktop.
4. Otherwise a clear "cannot play" message with the reason.

The player UI is **Vidstack** (MIT; HLS, DASH, YouTube, Vimeo). Its maintainer only merges PRs now, so we track **Video.js v10**, the merged successor, and swap once it is GA. The player sits behind our own `<MediaSurface>` component so the swap stays in one place.

## Consequences

### In 6 months

- An MKV with H.264 + AAC plays after a fast remux, with no full transcode.
- The player choice is contained in `<MediaSurface>`.

### In 2 years

- The Video.js v10 swap touches one component.
- Desktop covers the hard cases with native ffmpeg or mpv ("plays anything" mode).

## Alternatives considered

- **Always transcode.** Slow, battery-heavy, and hits the ffmpeg.wasm size limit.
- **react-player.** Fine for embeds, too thin for a local library player.
- **Start on Video.js v10 now.** It was not GA during research. Check again at the start of Phase 7.

## Revisit when

- Video.js v10 reaches GA (check at the start of Phase 7).
- Chromium adds AC3/DTS support, or HEVC becomes reliable without hardware.
- macOS or Linux desktop builds are needed (more codec testing).
