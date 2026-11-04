# ADR-0001: Desktop shell is Electron (Tauri rejected for now)

| | |
|---|---|
| Status | Accepted |
| Date | 2026-11-04 |
| Deciders | Isaac Gideon (owner) |

Source: FRD.md D1, §4.4, Phase 8.

## Context

Wanheda is a Next.js app first. In Phase 8 it also needs a desktop shell with native powers: tray, global shortcuts, native files, a floating island window and native TTS.

The app depends on a full Next server: Server Actions, Route Handlers and `proxy.ts`. The media module needs one predictable codec target.

There are two proven shells in past projects:

- **Raven** (`D:\Vxrcel\email-manager\desktop\`): Electron + electron-builder + electron-updater around the Next standalone server. It has a tray, notifications, deep links, CSP, secret sealing, PGlite and migration backups, all with tests.
- **companion-tts** (`D:\Vxrcel\companion-tts`): Tauri v2 with Piper in Rust, transparent always-on-top windows and a tray.

## Decision

Use **Electron**, built by porting Raven's desktop shell. The `output: "standalone"` Next server runs in an Electron utility process.

UI code stays shell-agnostic. It talks to native features only through the `lib/platform/` bridge (FRD §4.4).

## Consequences

### In 6 months

- Phase 8 is mostly porting tested Raven code, not new work.
- The media module has one codec target: the bundled Chromium. H.264, AAC, VP9, AV1, Opus and FLAC work. HEVC uses hardware decode. AC3 and DTS do not.

### In 2 years

- We carry Electron's 8-week Chromium cadence and a larger installer (about 300 MB). For a personal app, disk size does not matter.
- One architecture (a full Next server everywhere) avoids a static-export rewrite of every server feature.
- If Tauri wins later, only the `lib/platform` bridge and the native services change.

### What we lose

- companion-tts's Rust Piper code does not drop in. On desktop, Piper runs through `sherpa-onnx` (Node addon or CLI sidecar) instead (ADR-0005).

## Alternatives considered

- **Tauri v2.** About 60 MB for a real app. But it needs `output: "export"` (no Server Actions, Route Handlers or proxy) plus a remote API, or a Node/Bun sidecar that cancels out the size advantage. WebKitGTK on Linux depends on GStreamer and is unreliable for media.
- **PWA only.** No tray, no global shortcuts, no always-on-top island, no native TTS.

## Revisit when

- Electron's size or update cadence becomes a real problem.
- Tauri gains a good way to run a full Next server without a heavy sidecar.
- Wanheda is ever distributed to other people (installer size and signing matter more then).
