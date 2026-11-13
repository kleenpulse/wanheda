import type { MessageBoxOptions, MessageBoxReturnValue } from "electron";
import { autoUpdater, NsisUpdater, type UpdateInfo } from "electron-updater";
import type { UpdateState } from "./bridge";
import { CHECK_EVERY_MS, FIRST_CHECK_DELAY_MS, type UpdateMode } from "./update-policy";
import { NO_UPDATE, nextUpdateState, type UpdateEvent } from "./update-state";

/*
 * Self-update (SPEC T81, V75). Checks this repo's published GitHub Releases
 * 30 s after start, every 6 hours, and from "Check for updates…". A new
 * version downloads in the background (only the changed blocks once an
 * updating version is installed: the installer keeps a copy of itself for
 * that). Then the title bar's pill, the tray or a notification offers to
 * restart. Nothing installs silently (V75): the installer starts only after
 * the owner chose "Restart now" / "Restart to update", once the windows closed
 * and the cookies were flushed. A plain quit leaves the download cached and the
 * pill comes back at the next start.
 */

export type UpdaterHooks = {
  log: { info(line: string): void };
  /** A message box, on top of the main window when it's showing. */
  showBox(options: MessageBoxOptions): Promise<MessageBoxReturnValue>;
  /** Every change the pill shows. */
  onState(state: UpdateState): void;
  /** Quit, then install and start the new version. */
  restartToUpdate(): void;
  /** Start Wanheda again once it exits (the update couldn't start). */
  relaunch(): void;
};

export type Updater = {
  readonly mode: UpdateMode;
  start(): void;
  /** From the menu or the tray: says what it found, even when there's nothing new. */
  checkNow(): void;
  /** Where the update stands now, for a page that just loaded. */
  state(): UpdateState;
  /** "Restart to update": ignored unless an update is ready. */
  restart(): void;
  /**
   * The last step of quitting. Starts the downloaded update's installer only
   * when the owner asked to restart into it, and says how long to wait before
   * app.exit (0: exit now).
   */
  installOnQuit(restart: boolean): number;
};

/**
 * electron-updater's codes for "nothing to update from": a 404 on the latest
 * release's latest.yml (a release made before the app updated itself), or no
 * published release at all. (Its "latest version not found" code also covers
 * being offline, so it isn't here.)
 */
const NO_UPDATE_FEED = new Set(["ERR_UPDATER_CHANNEL_FILE_NOT_FOUND", "ERR_UPDATER_NO_PUBLISHED_VERSIONS"]);

export function createUpdater(mode: UpdateMode, hooks: UpdaterHooks): Updater {
  const { log, showBox } = hooks;
  if (mode === "off") return { mode, start() {}, checkNow() {}, state: () => NO_UPDATE, restart() {}, installOnQuit: () => 0 };

  // One truth for the pill, the menu and quitting: electron-updater deletes a ready installer once a newer one starts downloading.
  let state = NO_UPDATE;
  const ready = (): string | null => (state.kind === "ready" ? state.version : null);
  let firstCheck: ReturnType<typeof setTimeout> | undefined;
  let everyFewHours: ReturnType<typeof setInterval> | undefined;

  autoUpdater.logger = {
    info: (m: unknown) => { log.info(`updater: ${String(m)}`); },
    warn: (m: unknown) => { log.info(`updater warning: ${String(m)}`); },
    error: (m: unknown) => { log.info(`updater error: ${String(m)}`); },
  };
  autoUpdater.autoDownload = true;
  // installOnQuit starts the installer itself, once the windows are closed.
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.fullChangelog = false;
  autoUpdater.disableWebInstaller = true;

  function emit(event: UpdateEvent): void {
    const next = nextUpdateState(state, event);
    if (next === state) return;
    state = next;
    hooks.onState(state);
  }

  // Without a listener, an "error" event would throw. Failed checks are logged, and a failed download hides the pill.
  autoUpdater.on("error", (err: Error) => {
    log.info(`update failed: ${err.message.split("\n")[0] ?? ""}`);
    emit({ type: "error" });
  });
  autoUpdater.on("update-available", (info: UpdateInfo) => { emit({ type: "available", version: info.version }); });
  autoUpdater.on("download-progress", (progress: { percent: number }) => { emit({ type: "progress", percent: progress.percent }); });
  autoUpdater.on("update-downloaded", (info: UpdateInfo) => { emit({ type: "downloaded", version: info.version }); });

  async function askToRestart(version: string): Promise<void> {
    const { response } = await showBox({
      type: "info",
      title: "Wanheda",
      message: `Wanheda ${version} is ready.`,
      detail: "Restart Wanheda to finish the update. If you choose Later, the Restart to update button stays in the title bar.",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
    });
    // A newer version may have started downloading while the box was open, deleting this installer.
    if (response === 0 && ready() === version) hooks.restartToUpdate();
  }

  function check(): void {
    autoUpdater.checkForUpdates().catch(() => {
      // Already logged by the "error" listener.
    });
  }

  async function checkNow(): Promise<void> {
    const version = ready();
    if (version) return askToRestart(version);
    const current = autoUpdater.currentVersion.version;
    let found: UpdateInfo | null = null;
    try {
      const result = await autoUpdater.checkForUpdates();
      found = result?.isUpdateAvailable ? result.updateInfo : null;
    } catch (err) {
      const noFeed = NO_UPDATE_FEED.has(String((err as { code?: unknown }).code));
      await showBox({
        type: noFeed ? "info" : "warning",
        title: "Wanheda",
        message: noFeed ? "There's no update for Wanheda yet." : "Wanheda couldn't check for updates.",
        detail: noFeed ? `Version ${current}` : "Check your connection and try again.",
        buttons: ["OK"],
      });
      return;
    }
    if (!found) {
      await showBox({ type: "info", title: "Wanheda", message: "You have the newest version of Wanheda.", detail: `Version ${current}`, buttons: ["OK"] });
      return;
    }
    // A download that finished during the check: offer the restart now.
    const nowReady = ready();
    if (nowReady) return askToRestart(nowReady);
    await showBox({ type: "info", title: "Wanheda", message: `Wanheda ${found.version} is downloading.`, detail: "Wanheda tells you when it's ready.", buttons: ["OK"] });
  }

  return {
    mode,
    start() {
      firstCheck = setTimeout(check, FIRST_CHECK_DELAY_MS);
      everyFewHours = setInterval(check, CHECK_EVERY_MS);
    },
    checkNow() {
      void checkNow().catch((err: unknown) => { log.info(`update check: ${String(err)}`); });
    },
    state: () => state,
    restart() {
      if (ready()) hooks.restartToUpdate();
      else log.info(`ignored "restart to update" (${state.kind})`);
    },
    installOnQuit(restart) {
      clearTimeout(firstCheck);
      clearInterval(everyFewHours);
      const version = ready();
      if (!version || !(autoUpdater instanceof NsisUpdater)) return 0;
      // V75: a plain quit never installs. The download stays cached and the pill returns at the next start.
      if (!restart) {
        log.info(`Wanheda ${version} is waiting for "Restart to update"`);
        return 0;
      }
      log.info(`installing Wanheda ${version} and restarting`);
      // Silent NSIS UI: the owner already chose. NSIS starts Wanheda again with --force-run.
      if (!autoUpdater.install(true, true)) {
        // The installer is gone from the cache: come back on this version instead of just closing.
        log.info("the update couldn't start; restarting on this version");
        hooks.relaunch();
        return 0;
      }
      // A failed spawn is reported (and retried with elevate.exe) a tick later: give it a moment,
      // well under the 1.3 s the installer waits before it closes Wanheda.
      return 500;
    },
  };
}
