# Hand-off: Phase 8, T81 PR #107 and the auto-download switch

## State in one paragraph

`phase-8/t81-updater` (4 commits off `main` at `64a78ce`, tip `1014178`) is pushed. The owner allowed the push on 2026-11-14 and it is open as **PR #107**. Forged-commit check and tripwire are clean. On the metered-line question, the owner chose **a switch, default off**. It is built on the same branch. The Reviewer (wanheda-9e) passed the tip check and gave FIX on the switch diff: a version downloaded before a quit came back as Download update. That is fixed, and the switch is committed as `06d56f6` and pushed with this hand-off. The Reviewer's check of the fix delta and the push is pending. Both typechecks pass, tripwire and gitleaks are clean, and the 5 touched test files pass (63 tests after the fix). A full Vitest run before the fix passed 187 files / 1901 tests; earlier runs on a busy machine gave load timeouts (different tests each run) that passed alone.

## What changed (`06d56f6`)

- `desktop/settings.ts`: `autoDownloadUpdates` (default false), parsed like the other flags (`lifecycle.test.ts`).
- `desktop/bridge.ts`: `UpdateState` gains `available`. Also new: `CHANNELS.updateDownload`, `DesktopChange { autoDownloadUpdates }`, and `DesktopState.autoDownloadUpdates` (null when the updater is off). Bridge v3 is unreleased, so `BRIDGE_VERSION` stays 3 and the comment covers the change.
- `desktop/update-state.ts` (+ test, rewritten): `available` carries `downloading`. A new `download` event. A failed download goes back to `available` (it used to go to `none`). Progress while `available` shows the ring again, which also fixes Reviewer nit 3. The tray label for `available` is "Download Wanheda X".
- Reviewer FIX (2026-11-14), fixed: with the switch off, a version downloaded before a plain quit came back as "Download update", not "Restart to update" (electron-updater only finds its cache by downloading). Now `settings.json` `downloadedUpdate` remembers the last downloaded version; when a check finds it again, it downloads by itself (`downloadsNow`), the cached installer answers at once, and the pill is "Restart to update" again. A wiped cache fetches it again without a click (a version the owner already chose). Nit taken: a notification for an offered version while the window is hidden, once per version (`updateNotice(state, previous)`), and clicking it downloads.
- `desktop/updater.ts`: `createUpdater(mode, autoDownload, hooks)`, `download()` (joins a download already under way), and `setAutoDownload()` (on: starts an offered download; off: lets a running download finish). "Check for updates…" asks Download / Later.
- `desktop/main.ts`: IPC `update-download`, a desktopSet branch, `desktopState()` field, and the tray item's click by state.
- `desktop/preload.ts` `update.download()`; `desktop/tray.ts` comments.
- `lib/platform/desktop.ts` (+ test): the `available` state, `DesktopState.autoDownloadUpdates?`, and `desktopUpdate()` now also requires `download`.
- `components/shell/update-pill.tsx`: "Download update" pill (neutral tint, `ArrowDownToLine`). `components/settings/desktop-section.tsx`: an "Updates" card with the switch, shown only when the shell sends a boolean.
- `CHANGELOG.md` (Unreleased T81 entry reworded), `desktop/RELEASING.md`, `SPEC.md` T81 note.

## Next steps (in order)

1. The Reviewer checks the FIX delta and the pushed tip. If it asks for another FIX, fix it, commit, push and ask again.
2. Merge only on the owner's word, then `git tidy`.
3. T82: two published releases prove N → N+1 (suggested 0.7.6 installed by hand, then the next one arrives through the pill). Each release only on the owner's word. With the switch off by default, the pill shows **Download update** first.

## Not verified

- No packaged run: the owner's installed copy holds the single-instance lock. T82 is the real check.
