# Architecture Decision Records

One file per decision. Each records the context, the decision, its effects in 6 months and in 2 years, the alternatives, and when to look again. Decisions D1–D9 come from `FRD.md` §2. The FRD is a local-only file (`D:\Vxrcel\wanheda\FRD.md`), kept out of the public repo; "Source: FRD.md …" lines below refer to it.

- [ADR-0001](0001-desktop-shell-electron.md): Desktop shell is Electron, ported from Raven (Tauri rejected for now).
- [ADR-0002](0002-database-neon-drizzle.md): Neon Postgres + Drizzle, null DB handle when unconfigured; previews get no database.
- [ADR-0003](0003-auth-better-auth-owner-only.md): Better Auth with passkey + GitHub, owner allowlist, gate modes `demo` / `locked` / `gated`.
- [ADR-0004](0004-shell-launcher-mini-windows.md): Launcher + full-screen apps + pop-out mini windows, no window manager in v1.
- [ADR-0005](0005-tts-piper-kokoro.md): Piper everywhere (WASM on web, native on desktop), Kokoro as the quality option, GPL note.
- [ADR-0006](0006-media-native-remux-transcode.md): Media plays native first, remux second (Mediabunny), transcode last, behind `<MediaSurface>`.
- [ADR-0007](0007-object-storage-cloudflare-r2.md): Uploads go to Cloudflare R2 through presigned URLs.
- [ADR-0008](0008-sync-server-first-outbox.md): Server-first sync with a Dexie outbox for notes, no sync engine yet.
- [ADR-0009](0009-visual-system-vxrcel-ui-design.md): `vxrcel-ui-design` with Ember + Nebula in Phase 0, Bench in Phase 1, separate data palette in Phase 3.
- [ADR-0010](0010-hosting-region-eu-frankfurt.md): Neon `eu-central-1` and Vercel `fra1` (Frankfurt), for NDPA reasons.
- [ADR-0011](0011-public-repo-and-branch-rules.md): Public repo with the `protect-default-branch` ruleset, gitleaks, and the forged-commit check over every commit.
- [ADR-0012](0012-tts-web-engine-onnxruntime-web.md): Piper on the web = raw onnxruntime-web + espeak-ng `phonemizer`, pre-warmed on reader open, single-threaded until the app is cross-origin isolated (Phase 6 spike).
