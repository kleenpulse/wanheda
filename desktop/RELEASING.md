# Releasing the desktop app

How a new version of the Windows installer gets onto GitHub Releases. The installer is built only by CI (`.github/workflows/desktop.yml`), never uploaded from a developer machine.

## Cutting a release

1. Check that `## [Unreleased]` in `CHANGELOG.md` says what changed.
2. On an up-to-date `main`, run `bun run bump patch` (or `minor`, `major`). It makes `release/vX.Y.Z` with a `chore(release): vX.Y.Z` commit that moves the Unreleased notes under the new version and updates `package.json`. Push it and open a PR.
3. After that PR is merged, update `main` (check the incoming commits first), then run `bun run bump --tag`. It adds the annotated tag `vX.Y.Z` on `main`'s HEAD and doesn't push.
4. Push the tag: `git push origin vX.Y.Z`. That starts the **Desktop** workflow:
   - **rails:** the worm tripwire, before anything is installed.
   - **build** (Windows): installs with `--ignore-scripts`, fetches the pinned Electron and ffmpeg (`--full`, checked against the zip's sha256), builds in demo mode, packs the NSIS installer, checks the server folder and Electron's fuses, writes `SHA256SUMS.txt` and smoke-tests the server.
   - **draft release:** checks every file against `SHA256SUMS.txt`, checks that the tag matches `package.json`, and makes a **draft** release. Its notes are that version's `CHANGELOG.md` section.
5. Open the draft on GitHub (Releases), check the files and edit the notes if you want.
6. Click **Publish release**. Nothing publishes by itself.

If the release job fails or you want to build again, delete the draft first. The job stops if a release for the tag already exists, so it never makes two.

The tag runs the workflow as it is at the tagged commit. A tag on a commit from before `desktop.yml` existed builds nothing.

## What the draft has

| File | For |
| --- | --- |
| `Wanheda-X.Y.Z-win-x64.exe` | The Windows installer (x64, per-user, unsigned) |
| `Wanheda-X.Y.Z-win-x64.exe.blockmap` | Lets a future updater download only the parts that changed |
| `latest.yml` | What a future updater reads, when electron-builder writes it |
| `SHA256SUMS.txt` | Checksums of every file above |

Don't rename the files.

## What's in the installer

The web app inside is built with every env name empty (`scripts/stage.ts`), and `scripts/verify.ts` refuses a server folder with any `.env` file in it. No secret is baked into the installer. On first run the app asks for a `.env` file or offers demo mode (see [README.md](README.md)).

## Not done yet

- **Updates.** The app doesn't check for new versions yet (the rest of SPEC T81: electron-updater, the restart pill). Until then, install each new version by hand.
- **Signing.** Builds are unsigned (V75), so Windows SmartScreen warns on first run: **More info → Run anyway**. Azure Trusted Signing comes later.
