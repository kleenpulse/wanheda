# Releasing the desktop app

How a new version of the Windows installer gets onto GitHub Releases. The installer is built only by CI (`.github/workflows/desktop.yml`), never uploaded from a developer machine.

## Cutting a release

1. Check that `## [Unreleased]` in `CHANGELOG.md` says what changed.
2. On an up-to-date `main`, run `bun run bump patch` (or `minor`, `major`). It makes `release/vX.Y.Z` with a `chore(release): vX.Y.Z` commit that moves the Unreleased notes under the new version and updates `package.json`. Push it and open a PR.
3. After that PR is merged, update `main` (check the incoming commits first), then run `bun run bump --tag`. It adds the annotated tag `vX.Y.Z` on `main`'s HEAD and doesn't push.
4. Push the tag: `git push origin vX.Y.Z`. That starts the **Desktop** workflow:
   - **rails:** the worm tripwire, before anything is installed.
   - **build** (Windows): installs with `--ignore-scripts`, fetches the pinned Electron and ffmpeg (`--full`, checked against the zip's sha256), stages the shell, packs the NSIS installer, checks the speech and media folders, that no server folder shipped, Electron's fuses, that the packaged `app-update.yml` points at this repo's releases and nothing else, and that `latest.yml` names this version and this installer's sha512, and writes `SHA256SUMS.txt`.
   - **draft release:** checks every file against `SHA256SUMS.txt`, checks that the tag matches `package.json`, and makes a **draft** release. Its notes are that version's `CHANGELOG.md` section.
5. Open the draft on GitHub (Releases), check the files and edit the notes if you want.
6. Click **Publish release**. Nothing publishes by itself. Publishing is what reaches the installed apps: at their next check (start, every 6 hours, or **Check for updates…**) they offer **Download update** (or download it by themselves, if that's turned on), then **Restart to update**.

If the release job fails or you want to build again, delete the draft first. The job stops if a release for the tag already exists, so it never makes two.

The tag runs the workflow as it is at the tagged commit. A tag on a commit from before `desktop.yml` existed builds nothing.

## What the draft has

| File | For |
| --- | --- |
| `Wanheda-X.Y.Z-win-x64.exe` | The Windows installer (x64, per-user, unsigned) |
| `Wanheda-X.Y.Z-win-x64.exe.blockmap` | Lets the updater download only the parts that changed |
| `latest.yml` | What the updater reads: the version, the installer's name and its sha512 |
| `SHA256SUMS.txt` | Checksums of every file above |

Don't rename the files, and don't delete a published release: the next version's updater fetches the previous release's `.blockmap` to download only what changed (without it, it falls back to the whole installer).

## What's in the installer

The Electron shell, the speech process with sherpa-onnx, and the pinned ffmpeg. There is no web app and no server inside: the app loads the hosted Wanheda, whose address is baked in when it is bundled (`WANHEDA_APP_URL`, production by default; [ADR-0016](../docs/adr/0016-desktop-loads-hosted-app.md)). No secret is in the installer, and the app asks for none: you sign in through your browser (see [README.md](README.md)).

## Updates

The installed app updates itself from this repo's **published** releases (SPEC T81, V75); drafts and prereleases are invisible to it. It checks 30 seconds after it starts, every 6 hours, and from **Check for updates…** (File in the title bar's menu, or the tray). A new version shows **Download update** in the title bar and the tray (and as a notification while the window is hidden), and downloads when you click it; with **Settings → Desktop → Download updates automatically** on (off by default, for metered connections) it downloads in the background by itself. While it downloads, the title bar shows its progress, then **Restart to update** (also in the tray, and as a notification while the window is hidden). Nothing installs until you choose it (V75): a plain quit keeps the download, and the button is back at the next start. It never installs while Windows logs off or shuts down.

After the first updating version, an update downloads only the parts that changed: the installer keeps a copy of itself in `%LOCALAPPDATA%\wanheda-updater\` to compare against. Versions up to 0.7.5 can't update themselves: install the first updating version by hand.

What the updater trusts: HTTPS to GitHub and the sha512 in `latest.yml`. Builds are unsigned, so no publisher is checked: whoever can publish a release on this repo can ship code to the installed apps.

## Not done yet

- **Signing.** Builds are unsigned (V75), so Windows SmartScreen warns on first run: **More info → Run anyway**. Azure Trusted Signing comes later; once `app-update.yml` names a publisher, the updater checks it.
