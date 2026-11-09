# Hand-off — Phase 8: Desktop — T78 desktop files

| | |
|---|---|
| Date | 2026-11-09 |
| Phase / checkpoint | P8 CP5: T78 native music and video folders built and checked in preview; T78 ticked |
| Branch | `phase-8/desktop-files` (off `main` at `e5168c7`), Reviewer LGTM, committed for a PR |
| HEAD at start | `e5168c7` — Merge pull request #82 from kleenpulse/phase-8/desktop-island |
| Previous hand-off | docs/handoff/2026-11-09-phase-8-t77-desktop-island.md |

## State in one paragraph
T77 merged as PR #82 (`e5168c7`) after wanheda-87's two FIXes, re-review, push check and main check. That follows the owner's standing go-ahead for this run: on LGTM, commit, push, PR, merge, then the next task. T78 is built.

The desktop app picks music and video folders in its own dialog and keeps them in main. The page reads files only through `wanheda-file://<root id>/<path>`, behind a realpath guard and with Range support:
- the music scan and player use that source;
- videos are fingerprinted from two ranges and played straight from the URL;
- folder changes on disk catch the index up through a watch.

Reviewer wanheda-87: LGTM with nits (2 taken, 1 left).

## Done this session
- **Desktop:**
  - `files.ts` (new, pure): root ids, `parseRoots`, `fileUrl` / `parseFileUrl`, `isInside`, `isUncPath`, `parseRange`, `contentType`.
  - `files-io.ts` (new): `resolveInRoot`, `serveFile`, `listRoot`, `watchRoot`, `loadRoots` / `saveRoots`.
  - `main.ts`:
    - the privileged scheme;
    - `protocol.handle` on the app session;
    - IPC `files:roots`, `files:pick`, `files:list` and `files:forget` (main window only);
    - `files-changed` pushes;
    - `pickRoot` (one music folder, which a new pick replaces; up to 8 video folders);
    - one watch per root.
  - `bridge.ts`: 5 channels plus `parseRootKind`. `preload.ts`: `window.wanheda.files`.
- **Web:**
  - `lib/security/csp.ts`: `wanheda-file:` in `media-src` and `connect-src` (inert on the web).
  - `lib/platform/desktop.ts`: files types, `desktopFileUrl`, `desktopFiles`.
  - **Music:**
    - `music-protocol.ts`: `ScanSource` gains `native`.
    - `music.worker.ts`: fetches each file through its URL; an incomplete listing prunes nothing.
    - `music-library.ts`: `startNative`, `followNative` (watch → rescan), and the native branch in load, pick, rescan and `musicFile`.
  - **Video:**
    - `fingerprint.ts`: `RangeReader`, `blobReader`, `urlReader`.
    - `engine-protocol.ts` / `engine.worker.ts`: `open-url` through `UrlSource`, with 2 tries.
    - `lib/platform/media.ts`: `open(File | {url, size})`.
    - `local.ts`: `NativeFile`, `nativeFile`, Dexie v6 `nativeFiles`, `keepNative` (demo stays tab-only), `Located` `native` (a HEAD check), `videosInNative`.
    - `use-media.ts` `addFile` takes a native file.
    - `stage.tsx` `sourceUrl`: the native URL plus `crossOrigin`.
    - `thumb-queue.ts`, `video-chrome.tsx` (no autoplay gesture needed) and `video-scrub.tsx` (previews) handle native files. `add-bar.tsx` "Open a folder" uses the shell on desktop.
- **Docs:** SPEC T78 ticked, V72 amended. README "Native folders" section, CHANGELOG entry.

## Verification (actual results)
- tripwire clean. `typecheck` and `desktop:typecheck` clean. Tests: 164 files, 1656 passed. ESLint on changed files: 0.
- **Unit tests:**
  - parsing: traversal spellings, encoded separators, drive letters, NUL, query, port, unknown root;
  - `isInside` case and boundary;
  - Range forms and 416;
  - on disk: a real junction out of the root and a file symlink are refused; a dot-folder and links are skipped by the walk; CORS only for the app origin;
  - a URL fingerprint equals the `Blob` fingerprint, with or without Range support.
- **Preview** (demo; native folder dialogs driven through Win32; the media were Windows system sounds plus a 3 s WebM recorded in the page; scratch files deleted afterwards):
  - **Music:**
    - Picking the folder read 3 songs. The dot-folder and the junction were skipped.
    - Playback was gapless across all 3 (`seam into item 1/2`).
    - A file added on disk was picked up by the watch: 4 songs.
  - **Live fetches from the page:**
    - a whole file → 200;
    - `bytes=0-15` → 206 `bytes 0-15/491516`;
    - the junction, `..%2F` and an unknown root id → 404.
  - **Videos:** "Open a folder" → native dialog → "Added 2 videos", recognised as S1E1 and S1E2, each with a thumbnail.
    - Episode 1 played to the end from `wanheda-file:`, and the next card was offered.
    - A frame drawn to a canvas stayed readable (`crossOrigin` anonymous).

## Review (wanheda-87): LGTM with nits
- **Nit 2, taken:** a disk change that arrives while a scan runs sets `nativeDirty`, and the scan's end (done or failed) rescans.
- **Nit 3, taken:** at the 9th videos folder the oldest is still let go, but a notice now names it ("Its videos stay in your list; open that folder again to play them").
- **Nit 1, left:** music is read whole per new or changed song, one at a time, as the FSA path effectively does too. Reading only a head range would mean a tokenizer change; noted for later.

## Decisions made
- **One music root:** a new pick replaces it. Video roots add up, to at most 8, and the same folder again is the same root.
- **Reads inside a dot-folder** of the root are allowed; only the walk skips them, as File System Access does.
- **Music is read whole per track**, as today with a `File`. Videos are read only by Range: fingerprint, probe and play.
- **A native video's place is kept by fp** (Dexie `nativeFiles`). `locate` checks it with a HEAD request, so a gone drive shows "Not on this device".
- **Root ids are 128 random bits**, so they work as capabilities. A request carrying another origin gets a 404.

## Known problems and risks
- **Not checked live:**
  - reopening a native video after a reload (demo keeps nothing on the device);
  - an unplugged drive;
  - a UNC root;
  - more than one video folder;
  - large files.
- **My test's download anchors** for a WebM blob opened child windows instead of downloading. That came from my synthetic click; T75 checked the app's real blob download.
- **Still open:** T44 (Phase 4 exit), 7c (unplugged drive), the owner's "Wanheda Desktop" GitHub OAuth app.

## Next steps (in order)
1. Merge the T78 PR once CI is green (the owner's standing go-ahead for this run), then the Reviewer's push and main checks.
2. T79 (desktop TTS: native Piper via sherpa-onnx). It needs a native package download: check its size against the metered-link rule first.

## Files to read first
- desktop/files.ts, desktop/files-io.ts, desktop/main.ts (`pickRoot`, `setRoots`, files handlers, `protocol.handle`)
- components/media/music-library.ts, lib/media/music.worker.ts, lib/media/local.ts, components/media/stage.tsx, lib/media/fingerprint.ts, lib/media/engine.worker.ts

## Env / services touched
- No new env vars. No downloads.

## Review state
- Branch / PR: `phase-8/desktop-files` / opened after LGTM.
- Checkpoint 1 (diff): LGTM with nits from wanheda-87; nits 2 and 3 taken, nit 1 left; LGTM stands.

### Reviewer prompt (T78)

```text
You are the REVIEWER for Wanheda (D:\Vxrcel\wanheda). Use the diff-reviewer skill; read-only, one pass.
Review the uncommitted diff on phase-8/desktop-files (T78 native folders). Read docs/handoff/LATEST.md → 2026-11-09-phase-8-t78-desktop-files.md, SPEC T78, V54, V58, V67, V72, desktop/README.md.
Bugs and edge cases only; verdict LGTM / LGTM with nits / FIX, sent to the Builder (wanheda-7a).
Weigh hardest: the realpath guard and URL parsing, serveFile (origin, Range, CORS), roots and IPC, the music scan's native source and prune rule, native video locate/play/fingerprint, CSP.
```
