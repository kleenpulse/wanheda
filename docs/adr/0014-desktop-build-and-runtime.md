# ADR-0014: Desktop build and runtime: Electron 45 with the standalone server on `localhost`, sherpa-onnx Piper in a utility process, pinned toolchain

| | |
|---|---|
| Status | Accepted |
| Date | 2026-11-08 |
| Deciders | Isaac Gideon (owner) |

Source: FRD.md D1, §4.4, §9.2, Phase 8. Refines [ADR-0001](0001-desktop-shell-electron.md) and [ADR-0005](0005-tts-piper-kokoro.md). SPEC T74, V67–V76.

## Context

Phase 8 ports Raven's Electron shell (`D:\Vxrcel\email-manager\desktop\`) and adds an island window, global shortcuts, native Piper and bundled ffmpeg. The plan left six questions to a spike (T74): does Raven's server bootstrap still work on Next 16.4.5; which host name the local origin uses; can a floating window sit over a fullscreen app and let clicks through; do global media keys beat Chromium's own media session; is native Piper at least 3× faster than the WASM engine; and how big is the installer.

The spike ran on 2026-11-08 (Eta) on the owner's laptop (i7-9850H, 6 cores / 12 threads, 32 GB, Windows 11, 1920×1080 at 100%). The harness lived in the session scratchpad, outside the repo. Nothing was installed into the repo.

The owner's connection is slow and metered (about 140 KB/s that evening), so the spike avoided large downloads:
- Electron was measured on **45.2.0**, from an official zip already in the local `@electron/get` cache, after checking it against both Electron's `checksums.json` and the release's `SHASUMS256.txt` (`8b3475a4…`). The pin is 45.2.1, which only adds Chromium backports.
- ffmpeg file sizes came from the release zip's central directory, read with two HTTP Range requests (70 KB instead of 161 MB).
- `onnxruntime-node` was not installed, because sherpa passed the speed gate.

### Packages read before install

Every package was installed into the scratch harness with `bun install --ignore-scripts` and `minimumReleaseAge = 604800`. That is the newest release at least 7 days old, and no lifecycle script ran. The whole tree (271 packages) was then scanned with the 2026-10 worm indicators, both loader-key regexes included: **clean**.

| Package | Version (published) | Licence | Notes |
|---|---|---|---|
| `electron` | 45.2.1 (2026-10-31) | MIT | Published by `electron-nightly`, no provenance (Electron's usual). 45.2.2 and 45.2.3 were too new. **It has no `postinstall` any more:** `install.js` is now an opt-in bin (`install-electron`), so installing never fetches the binary. Its deps are `@electron/get`, `@electron-internal/extract-zip` (which has a native binding) and `@types/node` ^24.9.0. |
| `electron-builder` | 26.18.1 (2026-10-26) | MIT | On the `v26` dist-tag; `latest` still points at 26.18.0. A dependency-bump patch (`app-builder-lib`, `builder-util`, `dmg-builder` 26.18.1, `builder-util-runtime` 9.7.1), published by GitHub Actions with provenance. One maintainer (`onegoldfishh`). |
| `electron-updater` | 6.8.12 (2026-10-26) | MIT | Same release train and provenance. Its runtime tree, which ships inside the app: `builder-util-runtime` 9.7.1, `fs-extra` 10.1.0, `js-yaml` 4.3.2, `lazy-val` 1.0.5, `lodash.escaperegexp` 4.1.2, `lodash.isequal` 4.5.0, `semver` 7.7.4, `tiny-typed-emitter` 2.1.0, `debug` 4.4.3, `ms` 2.1.3, `sax` 1.6.1. No `eval`, no `new Function`. The only hosts it calls are the configured provider's (GitHub). |
| `sherpa-onnx-node` | 2.0.1 (2026-10-26) | Apache-2.0 | GitHub Actions with provenance. JS glue only; its only dependency is the platform package below. |
| `sherpa-onnx-win-x64` | 2.0.1 (2026-10-26) | Apache-2.0 | Same. 22.6 MB: `onnxruntime.dll` (17.8 MB), `sherpa-onnx-c-api.dll`, `sherpa-onnx-cxx-api.dll`, `onnxruntime_providers_shared.dll`, `sherpa-onnx.node`. |

- **Licences:** every package in the tree is permissive (MIT 216, ISC 35, BSD 14, Apache-2.0 8, BlueOak 8, and one each of Python-2.0, 0BSD and WTFPL variants).
- **Install scripts:** only `electron-winstaller` 5.4.0 (Squirrel, pulled in by `electron-builder`) has one. It was blocked; NSIS doesn't need it.
- **Not needed:**
  - `@electron/get`: Wanheda fetches Electron with its own script.
  - `app-builder-bin` and `7zip-bin`: electron-builder 26.18 no longer depends on them.
  - `espeak-ng-data`: sherpa 2.x ignores it (see below).

**Build toolsets.** electron-builder 26.18 now downloads its tools on first use from `electron-userland/electron-builder-binaries` GitHub releases. Each one is sha256-pinned in its npm-signed source:
- 7-Zip `7zip@1.0.0` (`7zip-win-x64.tar.gz`, 480 KB, `be071f15…`, matched GitHub's digest when fetched for this spike)
- NSIS `nsis-3.0.4.1` (`9877df90…`) and `nsis-resources-3.4.1` (`593a9a92…`)
- `rcedit-windows-2_0_0` and `winCodeSign-2.6.0` (`cdaec715…`)

Environment variables can redirect these downloads (`ELECTRON_BUILDER_7ZIP_PATH`, `ELECTRON_BUILDER_BINARIES_DOWNLOAD_OVERRIDE_URL`, `ELECTRON_BUILDER_BINARIES_CUSTOM_DIR` and their `NPM_CONFIG_` forms), so CI must never set them.

**ffmpeg.** BtbN deletes its daily builds after about two weeks but keeps month-end builds, so a pin must name a month-end build. Release `autobuild-2026-10-31-12-59` has `ffmpeg-n9.0.2-39-g7adfbe40dc-win64-lgpl-9.0.zip` (160.9 MB, GitHub digest `9d37c564e0d01c18cde184a079fa6ef04d7d2783ada41da81d04165cc8f1a650`). Its `bin/ffmpeg.exe` is static and 126.1 MB (52.3 MB deflated). The shared build is larger for ffmpeg's needs (`avcodec-63.dll` alone is 87.6 MB, about 148 MB of DLLs in all).

The owner's global ffmpeg (Gyan 9.0 `full_build`) is GPL v3 (`--enable-gpl --enable-version3`), so it is fine for development but cannot be bundled (V74).

### Measurements

| | Result |
|---|---|
| (a) Raven's bootstrap on Next 16.4.5 | **Works unchanged.** `server.js` still inlines `const nextConfig = {…}` on one line, and `next/dist/server/lib/start-server` still exports `getRequestHandlers({ dir, port, isDev, server, hostname, quiet })`. The standalone build had one Turbopack junction (`.next/node_modules/shiki-<hash>`). A dereferencing copy resolved it, leaving 0 links. The staged server is 69 MB in 2,817 files. |
| (a) Cold start, 5 fresh Electron processes, demo mode | Process start → first painted window (`ready-to-show`): **median 1,563 ms** (1,521–1,625). Electron `ready` comes at about 130 ms. Server: Next required by about 230 ms, handlers ready by about 330 ms, and the first SSR warm-up request done at about 910 ms after the utility process starts. Then window load takes about 460 ms (TTFB about 230 ms). The OS file cache was warm; a first start after a reboot was not measured. |
| (a) Guard | 200 with the token. 403 without it, 403 with a foreign `Host`, and 403 with the other loopback name (`127.0.0.1` when the origin is `localhost`). The server ran with only `SystemRoot` and its own variables in its environment. |
| (b) WebAuthn on `http://localhost:<port>` | A secure context, with a platform authenticator available. `navigator.credentials.create()` with `rp.id = "localhost"` reached the Windows Hello ceremony (aborted by the harness after 1.5 s). |
| (b) WebAuthn on `http://127.0.0.1:<port>` | `SecurityError: This is an invalid domain.` in 2 ms. **An IP address cannot be a passkey site.** |
| (b) GitHub OAuth | Not run (it needs an OAuth app). GitHub's docs: a loopback `redirect_uri` "does not need to match the port" of the registered callback. Their example is `127.0.0.1`, and they call `localhost` "not recommended" without saying whether it gets the same port leniency. Raven's URL policy sends `github.com` to the system browser, so the OAuth callback, and its cookie, would land in the wrong browser. |
| (c) Transparent, frameless, `focusable: false` window at `setAlwaysOnTop(true, "screen-saver")`, shown with `showInactive()` over a fullscreen window | Screen capture: the pill's centre showed the pill and its transparent corner showed the window below, **so it is on top and see-through**. The fullscreen window kept focus and stayed fullscreen, even after a real click on the pill. |
| (c) Click-through | With `setIgnoreMouseEvents(true, { forward: true })`, a real OS click on the pill **landed on the window below**. With it off, the pill took the click. **`forward: true` delivered 0 mousemoves** to the pill in 3 runs, both over our own window and over another app. Electron's forwarding can't be relied on for hover. |
| (d) Media keys, our page playing, no global shortcut | Chromium's media session got the key (`pause`), through Windows' media controls. |
| (d) `globalShortcut` `MediaPlayPause` + `MediaNextTrack` registered | Both registered. The callback got both keys and the page's Media Session got **nothing**, so there is no double toggle. |
| (d) Another app started playing after ours (holding the OS media session), shortcut registered | Our callback got the key and the other app got nothing. **The global shortcut wins.** With the shortcut released, Windows routed the next key by its own rules (to us here). The "other app" was a second Chromium-based app, not Spotify. |
| (e) sherpa-onnx 2.0.1 with the stock Piper model | **The process exits** (`'sample_rate' does not exist in the metadata`, exit 127) instead of throwing. sherpa needs its metadata keys in the `.onnx`. |
| (e) sherpa 2.x and espeak | **sherpa ≥ 2.0.0 no longer phonemizes:** `--vits-data-dir is deprecated and ignored… use phoneme_codepoints with an external phonemizer`. The addon has no espeak-ng in it any more. |
| (e) sherpa inside Electron's `utilityProcess` | `generate()` fails with **`External buffers are not allowed`** (Electron's V8 memory cage). It works with `enableExternalBuffer: false`, which copies the samples. |
| (e) Speed: same voice (`en_US-lessac-medium` at piper-voices `b4e358f`, sha256 checked), same 22-sentence text (about 108 s of audio), same machine, same evening, phonemes from Wanheda's own `piper-ids.ts` + `phonemizer` 1.2.1 for every engine, phonemizing timed in. Median of 3 interleaved rounds. | WASM baseline (the `onnxruntime-web` 1.31.1 build Wanheda ships, wasm EP, SIMD, 1 thread, run in Node 24's V8; Chrome on the throttled Phase 6 run got 0.382): **RTF 0.281**, load 2.9 s. sherpa native: 1 thread 0.120 (2.3×), **2 threads 0.083 (3.4×)**, 4 threads 0.068 (4.1×). Model load 1.6 s. The same inside Electron 45's `utilityProcess`: 0.118 / **0.080** / 0.068. |
| (e) Output parity | With its default `silenceScale` 0.2, sherpa made 101 s of audio where WASM made 108 s, because it shortens pauses. With `silenceScale: 1` it made 108.6 s (WASM 108.2 s). At that setting the 2-thread RTF is **0.075 = 3.7× WASM**. |
| (e) Crash isolation | A rejected model killed only the speech utility process (exit `0xFFFFFFFF`); the main process kept running. |
| (f) Installer size (no NSIS run: the app folder was compressed with electron-builder's own 7-Zip toolset at its 7z settings, LZMA2 `-mx=9`; NSIS adds a stub of about 0.5 MB) | Electron + server + speech addon: **109.5 MB** (447 MB installed). With `electronLanguages: ["en-US"]`: **102.0 MB** (398 MB installed). With the static ffmpeg (T80), add about 45–52 MB to the installer and 126 MB installed. |

## Decision

- **Pins (exact):**
  - `electron` 45.2.1. Its Windows zip `electron-v45.2.1-win32-x64.zip` has sha256 `7c342aee45d5b4ccafe5dfe9037028796b082735a576e21e2b4e2d8422ebb727`, from the npm tarball's `checksums.json`.
  - `electron-builder` 26.18.1 and `electron-updater` 6.8.12.
  - `sherpa-onnx-node` 2.0.1 and `sherpa-onnx-win-x64` 2.0.1.
  - `@types/node` 24.19.2 (the root's pin; Electron 45 runs Node 24).
  - ffmpeg: BtbN `autobuild-2026-10-31-12-59` / `ffmpeg-n9.0.2-39-g7adfbe40dc-win64-lgpl-9.0.zip` / `9d37c564e0d01c18cde184a079fa6ef04d7d2783ada41da81d04165cc8f1a650`, staging only `bin/ffmpeg.exe`.

  `desktop/package.json` keeps `"trustedDependencies": []`.
- **Electron binary:** fetched by our own `.ts` script, never through `install.js` or `@electron/get`:
  1. download `electron-v<version>-win32-x64.zip` from the GitHub release;
  2. check its sha256 against the npm package's `checksums.json` and the release's `SHASUMS256.txt`;
  3. extract with `C:\Windows\System32\tar.exe` (no native unzip binding);
  4. write `dist/`, `dist/version` and `path.txt`.

  Without `path.txt`, `require("electron")` quietly runs `install.js` itself. The script skips the download when a local `@electron/get` cache zip passes the same check.
- **Origin host: `localhost`.**
  - The server still listens on `127.0.0.1` only. The guard accepts exactly `Host: localhost:<port>`.
  - Main sets `BETTER_AUTH_URL = http://localhost:<port>` for each launch from the saved port, so the passkey `rpID` is `localhost` and its `origin` matches.
  - Passkeys made on the web (rpID = the web domain) don't work on desktop, so the owner adds a desktop passkey after a first sign-in.
- **GitHub sign-in on desktop:**
  - A separate "Wanheda Desktop" GitHub OAuth app, with callback `http://localhost:<saved port>/api/auth/callback/github`. **This is an owner action.** Its id and secret arrive through the `.env` import (V69).
  - The OAuth pages open in a **separate auth window** that shares the app session but has **no preload**. Its navigation is limited to `https://github.com/` sign-in pages and the app origin's callback. It closes when it reaches the app origin.
  - **Amended 2026-11-09 (owner):** packaged and preview builds sign in in the **default browser**, like VS Code and `gh`. Main opens the authorize page with `shell.openExternal`. The server's token gate passes the browser's tokenless return on the callback path to main (the only tokenless request, exact Host still required) and moves the tab to a script-free page. Main checks the query against the sign-in it started (same `state`, 10 minutes, the verification row's life; Better Auth's state cookie lapses at 5 and then Better Auth itself asks to try again) and loads the callback in the app's window, where Better Auth's state cookie and the token are. The auth window above remains for `desktop:dev` only, because `next dev` has no gate to catch the return. See `desktop/oauth.ts`.
  - If the port ever moves, GitHub sign-in needs the callback updated. Passkeys keep working, because the rpID has no port.
- **Floating island hover:** don't rely on `forward: true`. While the island shows, main polls `screen.getCursorScreenPoint()` (about 30 Hz, and only then). It turns mouse events on while the cursor is inside the pill's rectangle (sent by the island renderer) and off outside it.
- **Media keys:** `globalShortcut` media keys are registered only while Wanheda has an audible owner (V60), and released when it goes idle. Registered keys never reach Chromium's media session, so there is no double toggle. Unregistered keys stay free for other apps.
- **Native Piper:**
  - `sherpa-onnx-node` 2.0.1 in its own `utilityProcess`, with **2 threads** and **`silenceScale: 1`**.
  - Phonemes come from the same `piper-ids.ts` + `phonemizer` as the web, passed as `phonemeCodepoints`, and every `generate` uses **`enableExternalBuffer: false`**.
  - sherpa needs metadata in the model, so after the catalog file passes its size + sha256 check (V46), the engine writes a derived copy with 7 metadata entries (`model_type`, `comment`, `language`, `voice`, `has_espeak`, `n_speakers`, `sample_rate`) appended as ONNX `metadata_props` (field 14). That's 131 bytes and deterministic: lessac medium `5efe09…` → `ea793a…`. The copy lives in userData.
  - A speech-process crash or exit falls back to WASM Piper (V73).
- **Server staging:** a dereferencing copy of `.next/standalone`, with `.next/static` and `public`, then a check that 0 symlinks or junctions are left.
- **Locales:** `electronLanguages: ["en-US"]`, about 7.5 MB off the installer.

## Consequences

### In 6 months

- The installer is about 102 MB, plus about 50 MB once ffmpeg lands (T80), and about 400–525 MB installed. Start → first window is about 1.6 s.
- Native speech is about 3.5× faster than the WASM engine, so long units are ready well before the one playing ends, and speech never needs the network.
- The speech process carries Apache-2.0 sherpa. espeak-ng (GPL-3) stays where ADR-0012 put it, inside `phonemizer`. The own-process rule now exists for crash isolation and the memory cage, not as a licence boundary.
- Desktop sign-in needs one owner action (a second GitHub OAuth app) and one desktop passkey.

### In 2 years

- Electron majors move about every 8 weeks. Each bump re-runs the smoke script (V68), which fails if Next's standalone layout or `getRequestHandlers` changes.
- sherpa's API moved under us once (2.0 dropped espeak). The engine adapter keeps that inside one file, and `onnxruntime-node` 1.31.1 (Microsoft, the same version as our `onnxruntime-web`) is the drop-in alternative: same feeds, same `piper-ids.ts`. It wasn't installed for the spike: 300 MB unpacked across all platforms, no provenance, and a `postinstall`.
- A custom LGPL ffmpeg with only the decoders and encoders Wanheda uses (AC3, E-AC3, DTS → AAC or Opus; MP4 and Matroska) would cut 126 MB to roughly 10 MB. Worth it only if size starts to matter.

## Alternatives considered

- **`127.0.0.1` as the origin.** It's what Raven uses and what GitHub recommends for loopback OAuth, but WebAuthn refuses an IP as the site, so passkeys would be impossible.
- **GitHub sign-in in the system browser with a `wanheda://` hand-back.** Keeps GitHub pages out of every app window, but needs a one-time code exchange and a new endpoint. The no-preload auth window is less code for the same isolation.
- **sherpa-onnx 1.13.8, the last release with espeak inside.** One fewer moving part, but it's a superseded line, and it brings GPL espeak into the addon.
- **The sherpa CLI as a child process.** No Node in the speech process, but the 2.x CLI would still need our phonemes, and a CLI per sentence costs a model load each time.
- **`forward: true` for island hover.** Delivered nothing on this machine.
- **The shared ffmpeg build.** More files and more bytes than the static `ffmpeg.exe` for what Wanheda needs.

## Amendments

### T75 (2026-11-08): desktop shell built

- **Electron is pinned to 45.2.0, not 45.2.1.** The owner chose this to keep the metered link free: 45.2.0 is the zip already in the local `@electron/get` cache, and `scripts/fetch-electron.ts` checks it against both `checksums.json` and `SHASUMS256.txt` before use. Move to the newest 45.x in T81, when CI does the download. `electron-builder.yml` points `electronDist` at the fetched Electron, so electron-builder never downloads its own.
- **The CSP has one source.** `lib/security/csp.ts` builds it, and `next.config.ts` sends it from `headers()` on every production response. The desktop runs that same server, so main adds no copy of its own (two policies would intersect, and a desktop-only entry would have to be added to both). Workers get it too: their scripts are responses like any other.
- **Installer: 127.7 MB, not about 102 MB.** electron-builder packs the NSIS payload as a differential-aware 7z (a pinned LZMA2 block size), so an update downloads only the blocks that changed. That compresses worse than the solid archive the spike measured. `compression: maximum` changes nothing, because 7z already gets `-mx=9`. Installed size is 377 MB.
- **The server bootstrap is `wanheda-server.cjs`.** The root `package.json` says `"type": "module"`, and standalone copies it, so a `.js` CommonJS bundle would load as ESM and fail.
- **sharp ships.** Wanheda uses `next/image` (the money logos), so the server folder keeps the one native binary `@img/sharp-win32-x64`. That's fine because the installer targets Windows x64 only, and `verify.ts` allows that exact file and no other `.node`.
- **The desktop `next build` runs in demo mode.** Every `.env.example` name is set to an empty string. Next still reads `.env.local`, but it fills only names that are unset (`@next/env` `processEnv`), so the owner's values never reach the build.
- **Start time:** the first start after install took 10 s from the demo choice to server ready (Windows scanning about 2,800 new files on first read). Later starts take 1.4 s from launch to server ready.

### T80 (2026-11-11): bundled ffmpeg

- **Only two files are fetched and shipped:** `bin/ffmpeg.exe` (132,190,720 bytes) and `LICENSE.txt`, kept as `ffmpeg.exe` and `FFMPEG-LICENSE.txt`. `desktop/ffmpeg-pin.ts` pins each one's size and sha256 next to the zip's. They are checked when fetched, when staged (the source and the staged copy) and again in the packaged folder.
- **The fetch reads the zip by Range.** `scripts/fetch-ffmpeg.ts` reads the zip's end record and central directory, then downloads only those two entries: about 55 MB instead of 169 MB. A stopped download carries on from where it was (it did, once, at 42 MB). Each entry must match the zip's own CRC-32 before the pin is looked at. `--full` downloads the whole zip and checks its sha256 too. CI (T81) should use `--full`: the per-file pins were first taken from a Range read on the owner's machine (approved for one fetch on 2026-11-11), so they rest on GitHub's TLS and the zip's CRC-32, not yet on the zip's sha256.
- **The build is LGPL version 3**, not 2.1: its configuration has `--enable-version3` and no `--enable-gpl`, and the licence text in the zip is the LGPL v3. It runs as its own program, unmodified, and the licence text ships next to it.
- **No temporary file.** ffmpeg writes fragmented MP4 to stdout, and main serves that as the body of a `wanheda-transcode:` response. The media worker fetches it and appends it to the same MSE buffer the remux uses, so the 30-seconds-ahead limit, eviction and seeking are the remux's own. When the worker stops reading (a seek, a closed player), main kills the process. V74's "temp output in userData" no longer applies.
- **Tracks are named by position, not by id.** ffmpeg reports no stream id for Matroska tracks, so `0:i:<id>` matched nothing. The page sends the track's place among the file's video or audio tracks (`0:V:n`, `0:a:n`; `V` skips cover art). If Mediabunny and ffmpeg ever count a file's tracks differently, the wrong audio track would be converted; no such file has been seen.
- **Seeking uses the file's own timestamps.** The worker asks for the keyframe's timestamp; `-seek_timestamp 1` stops ffmpeg from adding the file's start time (the MPEG-TS fixture starts at 1.4 s), and half a millisecond is added so rounding can't land one keyframe early.
- **Audio becomes stereo AAC at 192 kb/s.** Chrome downmixes surround anyway, and AAC needs no second codec string. Opus was not needed.
- **A file picked outside the native folders** is converted through a one-run grant: the preload reads its path from the File object (`webUtils.getPathForFile`), and main keeps the real path of a plain video file under a random token. Page script can't name a path.

Measured on the owner's laptop in a scratch harness outside the repo: Electron 45.2.0 running the real media worker, ladder and `transcode-io.ts` against the pinned ffmpeg, on generated 640×360 H.264 files.

| File | First frame | Seek to 41.3 s | Worker closed | Window destroyed mid-stream |
|---|---|---|---|---|
| H.264 + AC3 5.1, Matroska, 60 s | 454 ms | new job at 40.000, playing | ffmpeg killed, 0 left | not run for this file |
| H.264 + AC3 5.1, MPEG-TS, 60 s | 322 ms | new job at 40.005, playing | ffmpeg killed, 0 left | 0 ffmpeg left within 3 s |
| H.264 + DTS stereo, Matroska, 20 s | 181 ms | past the end: ended | 0 left | 0 left |

Audio was decoded in all three (`webkitAudioDecodedByteCount` rose), and on the web's caps alone each one planned as "can't play". Not measured: a real film, E-AC3, how the 5.1 downmix sounds, the picked-file grant, and the installer's new size (the ADR's estimate stands: about 45 to 52 MB more).
