# Hand-off — Phase 8: T81 self-updater built

## State in one paragraph

T81's missing half (the self-updater) is built on `phase-8/t81-updater` (off `main` at `64a78ce`), **uncommitted**, waiting for the owner's go-ahead or a Reviewer LGTM. `electron-updater` 6.8.12 is pinned in `desktop/package.json` and bundled into `main.js`. The packaged Windows app checks this repo's **published** releases 30 s after start, every 6 h and from "Check for updates…" (File menu, tray), downloads in the background, shows progress then "Restart to update" in the title bar (`components/shell/update-pill.tsx`), the tray and a notification while hidden, and installs after the windows close and the cookies flush, only on "Restart now" / "Restart to update" (a plain quit keeps the cached download; never on Windows shutdown). `electron-builder.yml` gained `publish: github kleenpulse/wanheda`, so builds write `resources/app-update.yml` and `latest.yml`; `desktop/scripts/build.ts` fails unless the feed is exactly this repo and `latest.yml` matches the installer's version, name and sha512. A scratch build of this tree passed those checks (`app-update.yml` = owner, repo, provider, `updaterCacheDirName: wanheda-updater`; the installer grew ~90 KB). Tripwire clean, both typechecks pass, 187 files / 1894 tests pass, lint clean on the touched page files.

## What changed

- `desktop/update-policy.ts` (+ test): `updateMode` (packaged ∧ win32 ⇒ auto, else off), `isOwnFeed`, `latestYmlProblem`.
- `desktop/update-state.ts` (+ test): none → downloading(%) → ready; notice and tray label.
- `desktop/updater.ts`: electron-updater wiring, the "Check for updates…" dialogs, `installOnQuit`.
- `desktop/main.ts`: updater created in `boot`, IPC `update-state-get` / `update-restart` (main window only), state pushed to the page, tray item, File menu item, install in `before-quit` after `shutdown()`.
- `desktop/bridge.ts`: `BRIDGE_VERSION` 3, three channels, `UpdateState`. `desktop/preload.ts`: `update.{state,onState,restart}`. `desktop/tray.ts`: update item + "Check for updates…".
- `lib/platform/desktop.ts` (+ test): `DesktopUpdateState`, `desktopUpdate()` (null before bridge v3), `parseUpdateState` (second lock). `components/shell/title-bar.tsx` places the pill.
- `desktop/electron-builder.yml` `publish:`, `desktop/scripts/build.ts` checks, `desktop/RELEASING.md` (Updates section, keep published releases for the blockmaps), `CHANGELOG.md` Unreleased entry, `SPEC.md` T81 → x.
- Side fix (owner, same session): note excerpts read Markdown tables and rules as text (`lib/notes/notes.ts` `isRule`, `tableRow`, `plainInline`; tests in `notes.test.ts`; CHANGELOG Fixed). Commit it separately as `fix(notes)`.
- Side change (owner, same session): the in-page island's read-aloud card puts Open at the end of the Speed / Voice / Sleep row (`components/island/speech-activity.tsx`; CHANGELOG Changed). Commit separately as `style(island)`. The desktop floating island's own speech card (`floating-island.tsx`) was not touched.
- Also uncommitted from before: `LATEST.md` and `2026-11-13-phase-8-v0.7.5-released.md` (commit them with this).

## Review (2026-11-14)

Reviewer (wanheda-9e): **LGTM with nits**, no FIX. Nits 1, 2 and 4 fixed: table rows are decided after list, heading and quote marks are stripped (+ test); the dead `checkingByHand` / `announce` path removed; a failed `install()` (installer gone from the cache) relaunches on this version instead of just closing. Nit 3 left: an offline re-check during a download flips the pill to hidden until "downloaded" (recovers by itself). Committed as three commits (`fix(notes)`, `style(island)`, T81). 187 files / 1895 tests pass.

## Decisions and open questions for the owner

1. **Install on quit vs V75 "⊥ silent install": settled strict (2026-11-14, Builder, owner asleep with a merge-on-LGTM go-ahead).** `installOnQuit` returns 0 unless `restart` is true; a plain quit keeps the cached download and the pill returns at the next start. The dialog, CHANGELOG, RELEASING.md and SPEC say so. If the owner wants VS Code's install-on-quit instead, it's the one `if (!restart)` block in `desktop/updater.ts`.
2. **Metered internet (still open, not built).** Downloads start by themselves. Updates after the first updating version are differential (the installer copies itself to `%LOCALAPPDATA%\wanheda-updater\installer.exe`), but if that fails electron-updater falls back to the whole ~160 MB installer. A "download updates automatically" switch in Settings → Desktop is not built; ask.
3. **SHA256SUMS check before install** (offered earlier in chat): not built. It would come from the same release as `latest.yml`, so it adds no trust against someone who can publish releases. Said so to the owner.

## Not verified

- No run of the packaged app: the owner's installed Wanheda was running, and a second packaged copy would hit its single-instance lock. `electron-updater` imports cleanly and `autoUpdater` is a lazy getter, so dev and preview never construct it.
- The real N → N+1 update is T82: install the first updating version (0.8.0) by hand, publish 0.8.1, watch the pill.

## Next steps (in order)

1. Owner (2026-11-14): on the Reviewer's (wanheda-c8) LGTM, commit, push, PR and merge. Decision 2 is still the owner's.
2. After the merge, T82 (phase exit) needs two published releases with the updater. Suggested order, each release only on the owner's word: a patch release with T81 (0.7.6), installed by hand → the next release (0.7.7, or 0.8.0 at the exit) arrives through the pill → the rest of T82's checklist → Phase 8 done hand-off and the minor version.
