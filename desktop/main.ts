import { app, BrowserWindow, dialog, globalShortcut, ipcMain, protocol, type IpcMainEvent, type IpcMainInvokeEvent, Menu, type MessageBoxOptions, type MessageBoxReturnValue, nativeTheme, Notification, screen, session, shell, type MenuItemConstructorOptions, type Session, type WebContents } from "electron";
import { randomBytes } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { CAPTURE_PATH, canTakeCommand, CHANNELS, needsLoad, openPath, parseAudible, parseMenuAnchor, parseRootKind, parseTitleBarColors, parseTtsInstall, parseCaptureText, parseDesktopChange, parseNotice, parseSecretsAction, trustedSender, type Command, type DesktopNotice, type DesktopSetResult, type DesktopState, type ShortcutStatus, type TitleBarColors } from "./bridge";
import { MAX_ENV_FILE, parseEnvFile, type Imported } from "./env-file";
import { serverEnv } from "./env";
import { hasTray, onAllWindowsClosed, onWindowClose, showTrayHint, type Lifecycle } from "./lifecycle";
import { linkArg, linkPath, WANHEDA_SCHEME } from "./links";
import { FILE_SCHEME, isRootId, MAX_ROOTS, newRootId, type Root } from "./files";
import { listRoot, loadRoots, saveRoots, serveFile, watchRoot } from "./files-io";
import { createSpeech } from "./tts";
import { isVoiceId, parseSynthRequest } from "./tts-model";
import { EMPTY_SNAPSHOT, ISLAND_PATH, ISLAND_SIZE, islandPosition, overIsland, parseIslandCommand, parseIslandReport, parseIslandSnapshot, shouldShowIsland, type IslandReport, type IslandSnapshot } from "./island";
import { createLog } from "./log";
import { menuKey, type MenuKey } from "./menu-keys";
import { CALLBACK_PATHS, callbackQuery, signInFrom, type PendingSignIn, type Provider } from "./oauth";
import { classifyAuthUrl, classifyUrl, navigationStep, permissionAllowed } from "./policy";
import { freePort, isPortFree, savePort, savedPort } from "./ports";
import { electronSealer } from "./sealer";
import { fileStore, loadSecrets, NoKeychainError, saveSecrets, type Sealer, type SecretStore } from "./secrets";
import { delay, ServerStartError, startDevServer, startStandaloneServer, type ServerHandle } from "./server-process";
import { loadSettings, saveSettings, type DesktopSettings } from "./settings";
import { TOKEN_HEADER } from "./shared";
import { MEDIA_KEYS, SHORTCUT_IDS, type ShortcutId } from "./shortcuts";
import { createTray, KEEP_RUNNING_LABEL, type WanhedaTray } from "./tray";
import { loadWindowState, MIN_SIZE, placeWindow, saveWindowState, type Rect } from "./window-state";

/*
 * Wanheda's desktop shell (Phase 8, ported from Raven's desktop/). The Next.js
 * standalone server runs in a utility process on 127.0.0.1, and the window
 * loads it as http://localhost:<port>. This main process owns the window, the
 * session, the sealed `.env` values and the server's lifetime. Requests to the
 * server carry a per-launch token only this process knows (desktop/README.md).
 */

type Mode = "dev" | "preview" | "packaged";

// A link that starts an unpackaged build has no env from the dev script, so its registered command names the mode.
const unpackagedMode = process.env.WANHEDA_DESKTOP_MODE ?? app.commandLine.getSwitchValue("wanheda-mode");
const mode: Mode = app.isPackaged ? "packaged" : unpackagedMode === "preview" ? "preview" : "dev";
const USER_DATA: Record<Mode, string> = { dev: "Wanheda Dev", preview: "Wanheda Preview", packaged: "Wanheda" };
// The installer's appId. Dev and preview get their own: Windows draws the taskbar
// icon from a Start menu shortcut with the same ID, and Electron adds one for
// electron.exe the first time it shows a notification.
const APP_ID: Record<Mode, string> = { dev: "io.github.kleenpulse.wanheda.dev", preview: "io.github.kleenpulse.wanheda.preview", packaged: "io.github.kleenpulse.wanheda" };
const START_PATH = "/";
/** Notifications kept on screen at once; older ones close. */
const MAX_NOTICES = 8;
const CAPTURE_SIZE = { width: 560, height: 232 };

// Set before the single-instance lock: the lock lives in userData.
app.setName("Wanheda");
app.setPath("userData", join(app.getPath("appData"), USER_DATA[mode]));
if (!app.isPackaged && process.env.WANHEDA_DEBUG_PORT) {
  app.commandLine.appendSwitch("remote-debugging-port", process.env.WANHEDA_DEBUG_PORT);
}

if (app.isPackaged && (app.commandLine.hasSwitch("remote-debugging-port") || app.commandLine.hasSwitch("remote-debugging-pipe"))) {
  // A debugging port would let any local program drive the signed-in window.
  app.exit(1);
} else if (!app.requestSingleInstanceLock()) {
  app.exit(0);
} else {
  boot();
}

function boot(): void {
  app.enableSandbox();
  if (process.platform === "win32") app.setAppUserModelId(APP_ID[mode]);

  const userData = app.getPath("userData");
  const logs = join(userData, "logs");
  const log = createLog(logs, "main.log", !app.isPackaged);
  const token = randomBytes(32).toString("base64url");
  const inFlight = new Set<number>();
  const secretStore = fileStore(join(userData, "secrets.json"));

  let server: ServerHandle | null = null;
  let secrets: Imported = {};
  let sealer: Sealer | null = null;
  let appOrigin: string | null = null;
  let mainWindow: BrowserWindow | null = null;
  /** Quick capture (V71): created hidden once the server is up, shown over any app by its shortcut. */
  let captureWindow: BrowserWindow | null = null;
  /** The accelerator each shortcut holds now, and how its last registration went. */
  const heldShortcuts = new Map<ShortcutId, string>();
  const shortcutStatus = new Map<ShortcutId, ShortcutStatus>();
  /** The media keys, held only while the page has an audible owner (V71, T74). */
  let mediaKeysHeld = false;
  /** The main window's page said it takes commands (its shell listener is up); reset by every new page. */
  let pageReady = false;
  /** The floating island (V70): its window, the page's latest snapshot, what the island window last reported. */
  let islandWindow: BrowserWindow | null = null;
  let islandSnapshot: IslandSnapshot = EMPTY_SNAPSHOT;
  let islandReport: IslandReport = { content: false, rect: null };
  let islandFloating = false;
  let islandHover = false;
  let islandTimer: ReturnType<typeof setInterval> | null = null;
  /** Native music and video folders (V72): picked in a dialog, kept here, read through `wanheda-file:`. */
  let roots: Root[] = loadRoots(userData);
  const rootWatches = new Map<string, () => void>();
  /** Native Piper (V73): voices in userData, synthesis in its own utility process. */
  const speech = createSpeech({ userData, speechDir: speechDir(), log });
  /** The title bar's colours from the main window's page (its skin), kept for a window made again. */
  let titleBarColors: TitleBarColors | null = null;
  // GitHub sign-in: the one started in the system browser, waiting for GitHub to send it back.
  let pendingSignIn: PendingSignIn | null = null;
  // Dev only: GitHub sign-in's own window (no preload), and the contents it owns.
  let authWindow: BrowserWindow | null = null;
  const authContents = new Set<number>();
  let quitting: "no" | "closing" | "done" = "no";
  // Windows is logging off or shutting down: windows must close, not hide.
  let sessionEnding = false;
  let settings: DesktopSettings = loadSettings(userData);
  let tray: WanhedaTray | null = null;
  // A link's path that came before the server was up (it started Wanheda, say); the newest wins.
  let pendingLink: string | null = null;
  // An import or "use demo mode" is restarting the server.
  let restarting = false;

  log.info(`starting (${mode}, Electron ${process.versions.electron})`);
  registerLinks();
  openLink(linkArg(process.argv));

  const lifecycle = (): Lifecycle => ({ keepRunning: settings.keepRunning, quitting: quitting !== "no" || sessionEnding, platform: process.platform });

  // Notifications are kept until clicked or closed: one that's garbage collected loses its click.
  const notices = new Set<Notification>();

  // Before ready: `wanheda-file:` serves the picked folders with Range (seeking) to the app's
  // pages, fetchable from workers. Every request goes through serveFile's checks (V72).
  protocol.registerSchemesAsPrivileged([
    { scheme: FILE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
  ]);

  ipcMain.handle(CHANNELS.ttsHas, (event, payload: unknown): boolean => {
    if (!fromWindow(event, mainWindow)) throw new Error("Not allowed.");
    return isVoiceId(payload) && speech.has(payload);
  });
  ipcMain.handle(CHANNELS.ttsInstall, async (event, payload: unknown): Promise<boolean> => {
    if (!fromWindow(event, mainWindow)) throw new Error("Not allowed.");
    const req = parseTtsInstall(payload);
    return req ? speech.install(req.voice, req.model, req.config) : false;
  });
  ipcMain.handle(CHANNELS.ttsSynth, (event, payload: unknown) => {
    if (!fromWindow(event, mainWindow)) throw new Error("Not allowed.");
    const req = parseSynthRequest(payload);
    if (!req) throw new Error("Not a speech request.");
    return speech.synth(req);
  });
  ipcMain.handle(CHANNELS.ttsDrop, (event, payload: unknown): void => {
    if (!fromWindow(event, mainWindow)) throw new Error("Not allowed.");
    if (isVoiceId(payload)) speech.drop(payload);
  });
  ipcMain.handle(CHANNELS.filesRoots, (event): Root[] => {
    if (!fromWindow(event, mainWindow)) throw new Error("Not allowed.");
    return roots;
  });
  ipcMain.handle(CHANNELS.filesPick, async (event, payload: unknown): Promise<Root | null> => {
    if (!fromWindow(event, mainWindow)) throw new Error("Not allowed.");
    const kind = parseRootKind(payload);
    if (!kind) throw new Error("Not a folder kind.");
    return pickRoot(kind);
  });
  ipcMain.handle(CHANNELS.filesList, async (event, payload: unknown) => {
    if (!fromWindow(event, mainWindow)) throw new Error("Not allowed.");
    const root = isRootId(payload) ? roots.find((r) => r.id === payload) : undefined;
    if (!root) throw new Error("Not a picked folder.");
    return listRoot(root);
  });
  ipcMain.handle(CHANNELS.filesForget, (event, payload: unknown): void => {
    if (!fromWindow(event, mainWindow)) throw new Error("Not allowed.");
    if (!isRootId(payload)) throw new Error("Not a picked folder.");
    setRoots(roots.filter((r) => r.id !== payload));
  });

  // The bridge (V67): each handler checks the sender (the window it expects,
  // its top frame, the app's origin), then parses what it was sent.
  ipcMain.on(CHANNELS.notify, (event, payload: unknown) => {
    if (!fromWindow(event, mainWindow)) return;
    const notice = parseNotice(payload);
    if (notice) showNotice(notice);
  });
  ipcMain.on(CHANNELS.titleBarColors, (event, payload: unknown) => {
    if (!fromWindow(event, mainWindow)) return;
    const colors = parseTitleBarColors(payload);
    if (!colors || !mainWindow) return;
    titleBarColors = colors;
    mainWindow.setTitleBarOverlay(titleBarOverlay());
  });
  ipcMain.on(CHANNELS.titleBarMenu, (event, payload: unknown) => {
    if (!fromWindow(event, mainWindow)) return;
    const anchor = parseMenuAnchor(payload);
    const win = mainWindow;
    if (!anchor || !win) return;
    // The page measures in CSS pixels; the menu opens in the window's DIPs.
    const zoom = win.webContents.getZoomFactor();
    Menu.getApplicationMenu()?.popup({ window: win, x: Math.round(anchor.x * zoom), y: Math.round(anchor.y * zoom) });
  });
  ipcMain.on(CHANNELS.media, (event, payload: unknown) => {
    if (!fromWindow(event, mainWindow)) return;
    const audible = parseAudible(payload);
    if (audible !== null) holdMediaKeys(audible);
  });
  ipcMain.handle(CHANNELS.desktopState, (event): DesktopState => {
    if (!fromWindow(event, mainWindow)) throw new Error("Not allowed.");
    return desktopState();
  });
  ipcMain.handle(CHANNELS.desktopSet, (event, payload: unknown): DesktopSetResult => {
    if (!fromWindow(event, mainWindow)) throw new Error("Not allowed.");
    const change = parseDesktopChange(payload);
    if (!change) throw new Error("Not a desktop setting.");
    if ("keepRunning" in change) {
      setKeepRunning(change.keepRunning);
      return { ok: true, state: desktopState() };
    }
    if ("island" in change) {
      updateSettings({ island: change.island });
      updateIsland();
      pushState();
      return { ok: true, state: desktopState() };
    }
    const { shortcut, accelerator } = change;
    const clash = SHORTCUT_IDS.some((id) => id !== shortcut && accelerator !== null && settings.shortcuts[id] === accelerator);
    if (clash) return { ok: false, state: desktopState() };
    updateSettings({ shortcuts: { ...settings.shortcuts, [shortcut]: accelerator } });
    applyShortcuts();
    pushState();
    return { ok: true, state: desktopState() };
  });
  ipcMain.handle(CHANNELS.secrets, async (event, payload: unknown): Promise<DesktopState> => {
    if (!fromWindow(event, mainWindow)) throw new Error("Not allowed.");
    const action = parseSecretsAction(payload);
    if (!action) throw new Error("Not a secrets action.");
    if (action === "import") await reimport();
    else await useDemo();
    return desktopState();
  });
  ipcMain.handle(CHANNELS.capture, (event, payload: unknown): boolean => {
    if (!fromWindow(event, captureWindow)) throw new Error("Not allowed.");
    const text = parseCaptureText(payload);
    if (text === null) return false;
    // The main window's page saves it through the notes outbox (V23), like any note.
    return sendCommand({ kind: "capture", text });
  });
  ipcMain.on(CHANNELS.commandsReady, (event, payload: unknown) => {
    if (!fromWindow(event, mainWindow)) return;
    const ready = parseAudible(payload);
    if (ready === null) return;
    pageReady = ready;
    if (!ready) return;
    // The signed-in shell is up. The helper windows loaded while signed out sit on the sign-in
    // page (the proxy sent them there): load their own pages now.
    reloadHelpers();
    // A new page: tell it again whether the floating island is up.
    islandFloating = false;
    updateIsland();
  });
  ipcMain.on(CHANNELS.islandPublish, (event, payload: unknown) => {
    if (!fromWindow(event, mainWindow)) return;
    const snapshot = parseIslandSnapshot(payload);
    if (!snapshot) return;
    islandSnapshot = snapshot;
    const win = islandWindow;
    if (win && !win.isDestroyed()) win.webContents.send(CHANNELS.islandSnapshot, snapshot);
  });
  ipcMain.handle(CHANNELS.islandGet, (event): IslandSnapshot => {
    if (!fromWindow(event, islandWindow)) throw new Error("Not allowed.");
    return islandSnapshot;
  });
  ipcMain.on(CHANNELS.islandReport, (event, payload: unknown) => {
    if (!fromWindow(event, islandWindow)) return;
    const report = parseIslandReport(payload);
    if (!report) return;
    islandReport = report;
    updateIsland();
  });
  ipcMain.on(CHANNELS.islandCommand, (event, payload: unknown) => {
    if (!fromWindow(event, islandWindow)) return;
    const command = parseIslandCommand(payload);
    if (!command) return;
    if (command.kind === "open") {
      showWindow();
      openInApp(command.path);
      return;
    }
    sendCommand({ kind: "island", command });
  });
  ipcMain.on(CHANNELS.captureClose, (event) => {
    if (fromWindow(event, captureWindow)) captureWindow?.hide();
  });

  // Windows starts a second copy with the link; it hands its arguments here and quits.
  app.on("second-instance", (_event, argv) => {
    showWindow();
    openLink(linkArg(argv));
  });
  app.on("web-contents-created", (_event, contents) => { harden(contents); });
  app.on("window-all-closed", () => {
    if (onAllWindowsClosed(lifecycle()) === "quit") app.quit();
  });
  app.on("activate", () => { showWindow(); });
  app.on("before-quit", (event) => {
    if (quitting === "done") return;
    event.preventDefault();
    if (quitting === "closing") return;
    quitting = "closing";
    void shutdown().then((ok) => {
      if (!ok) {
        quitting = "no";
        return;
      }
      quitting = "done";
      globalShortcut.unregisterAll();
      speech.stop();
      tray?.destroy();
      app.exit(0);
    });
  });

  app
    .whenReady()
    .then(start)
    .catch((err: unknown) => fail(err));

  async function start(): Promise<void> {
    Menu.setApplicationMenu(buildMenu(settings.keepRunning, menuActions));
    if (hasTray(process.platform)) {
      tray = createTray({
        open: showWindow,
        keepRunning: () => settings.keepRunning,
        setKeepRunning,
        quit: () => { app.quit(); },
      });
    }
    hardenSession(session.defaultSession);
    session.defaultSession.protocol.handle(FILE_SCHEME, (request) => serveFile(request, roots, appOrigin));
    for (const root of roots) watch(root);
    const win = createWindow();
    // The first-run question attaches to the splash window, so wait for it to show.
    await new Promise<void>((resolve) => {
      if (win.isVisible()) { resolve(); return; }
      win.once("show", () => { resolve(); });
      setTimeout(resolve, 3000);
    });
    secrets = await loadOrAskSecrets();
    server = await startServer();
    attach(server);
    const first = pendingLink ?? START_PATH;
    pendingLink = null;
    applyShortcuts();
    createCaptureWindow();
    createIslandWindow();
    await mainWindow?.loadURL(`${server.origin}${first}`);
  }

  /** Shows a link's page now, or once the server is up. */
  function openLink(link: string | undefined): void {
    if (link === undefined) return;
    const path = linkPath(link);
    if (!path) { log.info("ignored a link Wanheda doesn't open"); return; }
    if (!appOrigin) {
      pendingLink = path;
      return;
    }
    showWindow();
    openInApp(path);
  }

  /**
   * wanheda:// is only ever Wanheda's, so it's claimed at every start (the NSIS
   * installer doesn't register it). Not in dev mode: a link can't start
   * `next dev`. Unpackaged builds name their mode before the link: Electron
   * refuses to start if anything follows a link on the command line.
   */
  function registerLinks(): void {
    if (mode === "dev") return;
    const ok = app.isPackaged
      ? app.setAsDefaultProtocolClient(WANHEDA_SCHEME)
      : app.setAsDefaultProtocolClient(WANHEDA_SCHEME, process.execPath, [app.getAppPath(), `--wanheda-mode=${mode}`]);
    if (!ok) log.info("couldn't register wanheda:// links");
  }

  const menuActions: MenuActions = {
    setKeepRunning: (on) => { setKeepRunning(on); },
    importEnv: () => void reimport().catch((err: unknown) => { log.info(`import: ${errText(err)}`); }),
    useDemo: () => void useDemo().catch((err: unknown) => { log.info(`demo mode: ${errText(err)}`); }),
  };

  async function startServer(): Promise<ServerHandle> {
    const port = await pickPort();
    const serverLog = createLog(logs, "server.log", !app.isPackaged);
    if (mode === "dev") {
      const repoRoot = process.env.WANHEDA_REPO_ROOT;
      if (!repoRoot) throw new ServerStartError("Start dev mode with `bun run desktop:dev`.");
      const env = serverEnv(process.env, { mode: "dev", port, token, secrets });
      return startDevServer({ repoRoot, port, token, env, log: serverLog });
    }
    // Packaged: resources/server. Preview: desktop/.stage/server next to the staged app.
    const serverDir = app.isPackaged ? join(process.resourcesPath, "server") : join(app.getAppPath(), "..", "server");
    const env = serverEnv(process.env, { mode: "prod", port, token, secrets });
    const handle = await startStandaloneServer({ serverDir, port, env, log: serverLog });
    if (handle.port !== port) {
      log.info(`port ${port} was taken; the server moved to ${handle.port}. Data the window keeps per origin starts fresh.`);
      savePort(userData, handle.port);
    }
    return handle;
  }

  /** The main window while it can be seen: dialogs attach to it, so they never open behind it. */
  function shownWindow(): BrowserWindow | null {
    return mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() ? mainWindow : null;
  }

  function showBox(options: MessageBoxOptions): Promise<MessageBoxReturnValue> {
    const parent = shownWindow();
    return parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options);
  }

  /* ── Sealed .env values (SPEC V69) ────────────────────────────────────── */

  async function getSealer(): Promise<Sealer> {
    sealer ??= await electronSealer();
    return sealer;
  }

  /** The sealed values; on first run asks for a `.env` file or demo mode. */
  async function loadOrAskSecrets(): Promise<Imported> {
    const result = await loadSecrets(secretStore, await getSealer());
    if (result.kind === "ok") return result.values;
    if (result.kind === "none") return firstRun();
    const why =
      result.kind === "keychain-changed"
        ? `They were locked with "${result.was}", and this system now uses "${result.now}".`
        : result.kind === "keychain-unavailable"
          ? "They're locked with your system's keychain, and it isn't available right now. Quit and try again once it's back."
          : "The file that holds them can't be read.";
    log.info(`saved keys unreadable: ${result.kind}`);
    const { response } = await showBox({
      type: "warning",
      title: "Wanheda",
      message: "Wanheda can't open its saved keys.",
      detail: `${why} Starting fresh keeps the old file next to the new one, and asks for your .env file again.`,
      buttons: ["Quit", "Start fresh"],
      defaultId: 0,
      cancelId: 0,
    });
    if (response !== 1) {
      quitting = "done";
      tray?.destroy();
      app.exit(0);
      return new Promise<never>(() => {});
    }
    secretStore.keepBroken();
    return firstRun();
  }

  async function firstRun(): Promise<Imported> {
    // A cancelled picker or an unusable file asks again: only "Start in demo
    // mode" records demo mode.
    for (;;) {
      const { response } = await showBox({
        type: "question",
        title: "Wanheda",
        message: "Run Wanheda on your own data?",
        detail:
          "Choose your .env file: Wanheda takes the settings it knows, seals them with your system's keychain, and doesn't keep the file. Or start in demo mode with sample data. You can import a file later from the File menu.",
        buttons: ["Choose .env file…", "Start in demo mode"],
        defaultId: 0,
        cancelId: 1,
      });
      if (response !== 0) break;
      const values = await importEnvFile();
      if (values) return values;
    }
    await persist(secretStore, {});
    log.info("demo mode chosen");
    return {};
  }

  /** Asks for a `.env` file, seals what it knows from it. Null when cancelled or empty. */
  async function importEnvFile(): Promise<Imported | null> {
    const parent = shownWindow();
    const options = { title: "Choose your .env file", properties: ["openFile", "showHiddenFiles", "dontAddToRecent"] as ("openFile" | "showHiddenFiles" | "dontAddToRecent")[] };
    const picked = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
    const file = picked.filePaths[0];
    if (picked.canceled || !file) return null;
    let text: string;
    try {
      if (statSync(file).size > MAX_ENV_FILE) throw new Error("too large");
      text = readFileSync(file, "utf8");
    } catch {
      await showBox({ type: "warning", title: "Wanheda", message: "That file can't be read as a .env file.", buttons: ["OK"] });
      return null;
    }
    const { values, taken, ignored } = parseEnvFile(text);
    if (taken === 0) {
      await showBox({ type: "warning", title: "Wanheda", message: "That file has no Wanheda settings.", detail: "Wanheda looks for the names in .env.example, such as DATABASE_URL.", buttons: ["OK"] });
      return null;
    }
    await persist(secretStore, values);
    log.info(`imported ${taken} settings (${ignored} other names left out)`);
    return values;
  }

  /** Seals and saves; with no keychain, the values last for this run only. */
  async function persist(store: SecretStore, values: Imported): Promise<void> {
    try {
      await saveSecrets(store, await getSealer(), values);
    } catch (err) {
      if (!(err instanceof NoKeychainError)) throw err;
      log.info(`not saved: ${err.message}`);
      await showBox({
        type: "warning",
        title: "Wanheda",
        message: "Wanheda can't save your keys.",
        detail: "Your system's keychain isn't available, and Wanheda never saves them unencrypted. They last until you quit.",
        buttons: ["OK"],
      });
    }
  }

  async function reimport(): Promise<void> {
    if (restarting || !server) return;
    const values = await importEnvFile();
    if (!values) return;
    secrets = values;
    await restartServer();
  }

  async function useDemo(): Promise<void> {
    if (restarting || !server) return;
    const { response } = await showBox({
      type: "question",
      title: "Wanheda",
      message: "Forget your imported keys and use demo mode?",
      detail: "Wanheda deletes its sealed copy and restarts on sample data. Your data stays where it is; import your .env file again to get back to it.",
      buttons: ["Cancel", "Use demo mode"],
      defaultId: 0,
      cancelId: 0,
    });
    if (response !== 1) return;
    secrets = {};
    await persist(secretStore, {});
    await restartServer();
  }

  /** Stops the server and starts it again with the current values, on the same port. */
  async function restartServer(): Promise<void> {
    restarting = true;
    try {
      await server?.stop();
      server = await startServer();
      attach(server);
      const win = mainWindow;
      if (win && !win.isDestroyed()) await win.loadURL(`${server.origin}${START_PATH}`);
    } catch (err) {
      await fail(err);
    } finally {
      restarting = false;
    }
  }

  /** The saved port, unless something else holds it for more than ~2 s. */
  async function pickPort(): Promise<number> {
    const saved = savedPort(userData);
    if (saved) {
      for (let i = 0; i < 10; i++) {
        if (await isPortFree(saved)) return saved;
        await delay(200);
      }
    }
    const port = await freePort();
    if (saved) log.info(`port ${saved} is taken; moving to ${port}. Data the window keeps per origin starts fresh.`);
    savePort(userData, port);
    return port;
  }

  function attach(handle: ServerHandle): void {
    appOrigin = handle.origin;
    routeToken(session.defaultSession, handle.origin);
    if (captureWindow && !captureWindow.isDestroyed()) void captureWindow.loadURL(`${handle.origin}${CAPTURE_PATH}`);
    if (islandWindow && !islandWindow.isDestroyed()) void islandWindow.loadURL(`${handle.origin}${ISLAND_PATH}`);
    handle.onExit((detail) => void serverDied(handle, detail));
    handle.onOAuthCallback((provider, search) => {
      if (handle === server) finishSignIn(provider, search);
    });
    // A sign-in started against another server (or origin) can't finish on this one.
    pendingSignIn = null;
    log.info(`server ready at ${handle.origin}`);
  }

  async function serverDied(handle: ServerHandle, detail: string): Promise<void> {
    log.info(`server stopped: ${detail}`);
    if (quitting !== "no" || handle !== server) return;
    const { response } = await showBox({
      type: "error",
      title: "Wanheda",
      message: "Wanheda's background server stopped.",
      detail: `You can restart it, or quit and look at the log:\n${join(logs, "server.log")}`,
      buttons: ["Restart", "Quit"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response !== 0) { app.quit(); return; }
    try {
      server = await startServer();
      attach(server);
      for (const win of BrowserWindow.getAllWindows()) win.reload();
    } catch (err) {
      await fail(err);
    }
  }

  async function fail(err: unknown): Promise<void> {
    const message = err instanceof ServerStartError ? err.message : "Wanheda couldn't start.";
    log.info(`start failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    await showBox({ type: "error", title: "Wanheda", message, detail: `Logs: ${logs}`, buttons: ["Quit"] });
    quitting = "done";
    globalShortcut.unregisterAll();
    await server?.stop();
    tray?.destroy();
    app.exit(1);
  }

  /** Close windows (honouring "Stay"), let pagehide requests land, then stop the server (V68: drain ≤ 3 s). */
  async function shutdown(): Promise<boolean> {
    if (!(await closeWindows())) return false;
    await delay(300);
    const idleBy = Date.now() + 2000;
    while (inFlight.size > 0 && Date.now() < idleBy) await delay(50);
    await session.defaultSession.cookies.flushStore();
    await server?.stop();
    log.info("stopped");
    return true;
  }

  /** Brings the window back from the tray or a minimise. */
  function showWindow(): void {
    if (quitting === "done") return;
    if (!mainWindow || mainWindow.isDestroyed()) {
      // While quitting, the server is about to stop: a new window would sit on it.
      if (appOrigin && quitting === "no") createWindow();
      return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }

  function setKeepRunning(on: boolean): void {
    updateSettings({ keepRunning: on });
    Menu.setApplicationMenu(buildMenu(on, menuActions));
    tray?.refresh();
    // A hidden window keeps music, timers and speech at full pace.
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.setBackgroundThrottling(!on);
    pushState();
  }

  function updateSettings(change: Partial<DesktopSettings>): void {
    settings = { ...settings, ...change };
    try {
      saveSettings(userData, settings);
    } catch (err) {
      log.info(`couldn't save the settings: ${errText(err)}`);
    }
  }

  /** Closing hides the window while "keep running" is on; quitting closes it for real. */
  function hideOnClose(win: BrowserWindow): void {
    win.on("close", (event) => {
      const state = lifecycle();
      const action = onWindowClose(state);
      if (action === "close") return;
      event.preventDefault();
      win.hide();
      if (showTrayHint(state, action, settings.trayHintShown)) {
        updateSettings({ trayHintShown: true });
        notify("Wanheda is still running.", "Music, timers and speech go on. Open it from the tray.", showWindow);
      }
    });
  }

  function notify(title: string, body: string, onClick: () => void): void {
    if (!Notification.isSupported()) return;
    const notice = new Notification({ title, body, icon: join(app.getAppPath(), "icon.png") });
    for (const old of [...notices].slice(0, Math.max(0, notices.size - MAX_NOTICES + 1))) {
      notices.delete(old);
      old.close();
    }
    notices.add(notice);
    notice.on("click", () => {
      notices.delete(notice);
      onClick();
    });
    notice.on("close", () => notices.delete(notice));
    notice.show();
  }

  /**
   * A timer or an alert from the page (V67 parsed). Only while the window is
   * out of sight or unfocused: in front, the page shows it itself. Clicking
   * brings the window back on the notice's page.
   */
  function showNotice(notice: DesktopNotice): void {
    const win = mainWindow;
    if (win && !win.isDestroyed() && win.isVisible() && !win.isMinimized() && win.isFocused()) return;
    // The kind only: titles and bodies can hold names and amounts.
    log.info(`notice: ${notice.kind}`);
    notify(notice.title, notice.body, () => {
      showWindow();
      if (notice.path) openInApp(notice.path);
    });
  }

  /** Whether an IPC message came from `win`'s own top frame on the app's origin. */
  function fromWindow(event: IpcMainEvent | IpcMainInvokeEvent, win: BrowserWindow | null): boolean {
    if (!win || win.isDestroyed() || event.sender !== win.webContents) return false;
    const frame = event.senderFrame;
    return trustedSender(frame ? { origin: frame.origin, isTop: frame.parent === null } : null, appOrigin);
  }

  /** Hands the page something to do. False when the window has no app page to take it. */
  function sendCommand(command: Command): boolean {
    const win = mainWindow;
    if (!appOrigin || !win || win.isDestroyed()) return false;
    const contents = win.webContents;
    let onApp = false;
    try {
      onApp = new URL(contents.getURL()).origin === appOrigin;
    } catch {
      // The splash page (data:) or nothing yet.
    }
    if (!canTakeCommand({ onApp, loading: contents.isLoading(), ready: pageReady })) return false;
    contents.send(CHANNELS.command, command);
    return true;
  }

  function desktopState(): DesktopState {
    const names = Object.keys(secrets).length;
    return {
      keepRunning: settings.keepRunning,
      island: settings.island,
      shortcuts: SHORTCUT_IDS.map((id) => ({ id, accelerator: settings.shortcuts[id], status: shortcutStatus.get(id) ?? "off" })),
      secrets: { mode: names > 0 ? "own" : "demo", names },
    };
  }

  /** Tells Settings → Desktop, if it's open, that something changed (the tray or the menu, say). */
  function pushState(): void {
    const win = mainWindow;
    if (win && !win.isDestroyed()) win.webContents.send(CHANNELS.desktopChanged, desktopState());
  }

  /**
   * (Re)registers quick capture and the palette from the settings (V71). One
   * another app holds is reported as "taken" in Settings → Desktop, never
   * silently lost; it is tried again at the next start or change.
   */
  function applyShortcuts(): void {
    for (const id of SHORTCUT_IDS) {
      const held = heldShortcuts.get(id);
      if (held) globalShortcut.unregister(held);
      heldShortcuts.delete(id);
      const accelerator = settings.shortcuts[id];
      if (accelerator === null) {
        shortcutStatus.set(id, "off");
        continue;
      }
      let ok = false;
      try {
        ok = globalShortcut.register(accelerator, () => { runShortcut(id); });
      } catch (err) {
        log.info(`shortcut ${id}: ${errText(err)}`);
      }
      if (ok) heldShortcuts.set(id, accelerator);
      else log.info(`shortcut ${id} (${accelerator}) is taken by another app`);
      shortcutStatus.set(id, ok ? "on" : "taken");
    }
  }

  function runShortcut(id: ShortcutId): void {
    if (id === "capture") { showCapture(); return; }
    showWindow();
    sendCommand({ kind: "palette" });
  }

  /**
   * The media keys go to Wanheda's audible owner only while there is one: held
   * keys never reach Chromium's media session (so no double toggle), and
   * released keys stay free for other apps (ADR-0014 (d)).
   */
  function holdMediaKeys(on: boolean): void {
    if (on === mediaKeysHeld) return;
    mediaKeysHeld = on;
    log.info(on ? "media keys held" : "media keys released");
    for (const [key, action] of Object.entries(MEDIA_KEYS)) {
      if (!on) {
        globalShortcut.unregister(key);
        continue;
      }
      try {
        const run = () => {
          log.info(`media key: ${action}`);
          sendCommand({ kind: "media", action });
        };
        if (!globalShortcut.register(key, run)) log.info(`media key ${key} is taken`);
      } catch (err) {
        log.info(`media key ${key}: ${errText(err)}`);
      }
    }
  }

  /** The quick-capture window (V71): hidden until its shortcut, over any app; Esc, a save or a click away hides it. */
  function createCaptureWindow(): BrowserWindow | null {
    if (captureWindow && !captureWindow.isDestroyed()) return captureWindow;
    if (!appOrigin) return null;
    const win = new BrowserWindow({
      width: CAPTURE_SIZE.width,
      height: CAPTURE_SIZE.height,
      show: false,
      frame: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      title: "Quick capture",
      backgroundColor: background(),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: false,
        devTools: !app.isPackaged,
        spellcheck: true,
        preload: join(app.getAppPath(), "preload.js"),
      },
    });
    // Above full-screen apps too.
    win.setAlwaysOnTop(true, "pop-up-menu");
    // Its own zoom, not the main window's (same-origin windows share it by default).
    win.webContents.setZoomMode("isolated");
    win.on("close", (event) => {
      if (quitting !== "no" || sessionEnding) return;
      event.preventDefault();
      win.hide();
    });
    win.on("blur", () => { win.hide(); });
    // Sent to the sign-in page (signed out, or the session ended): sign-in belongs in the
    // main window, never in this little one.
    win.webContents.on("did-navigate", (_event, url) => {
      if (!appOrigin || !needsLoad(url, appOrigin, CAPTURE_PATH) || !win.isVisible()) return;
      win.hide();
      showWindow();
    });
    void win.loadURL(`${appOrigin}${CAPTURE_PATH}`);
    captureWindow = win;
    return win;
  }

  /**
   * The floating island (V70): one transparent, frameless window over every
   * other, made at start and hidden. It never takes focus, and clicks pass
   * through it everywhere but the island itself (`trackIslandCursor`).
   */
  function createIslandWindow(): BrowserWindow | null {
    if (islandWindow && !islandWindow.isDestroyed()) return islandWindow;
    if (!appOrigin) return null;
    const win = new BrowserWindow({
      width: ISLAND_SIZE.width,
      height: ISLAND_SIZE.height,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      title: "Wanheda island",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: false,
        devTools: !app.isPackaged,
        // Hidden most of the time, yet it must follow the snapshot and measure itself.
        backgroundThrottling: false,
        preload: join(app.getAppPath(), "preload.js"),
      },
    });
    // Above full-screen apps too (ADR-0014 (c)).
    win.setAlwaysOnTop(true, "screen-saver");
    win.setIgnoreMouseEvents(true);
    // Chromium shares zoom across same-origin windows: zooming the main window would grow the
    // island past its window and off its hit rect (CSS px vs screen points). Its own zoom stays 100 %.
    win.webContents.setZoomMode("isolated");
    win.on("close", (event) => {
      if (quitting !== "no" || sessionEnding) return;
      event.preventDefault();
      win.hide();
    });
    win.webContents.on("did-navigate", () => {
      islandReport = { content: false, rect: null };
      updateIsland();
    });
    void win.loadURL(`${appOrigin}${ISLAND_PATH}`);
    islandWindow = win;
    return win;
  }

  /** Loads quick capture's and the island's own pages again where they've been sent elsewhere (the sign-in page). */
  function reloadHelpers(): void {
    if (!appOrigin) return;
    for (const [win, path] of [[captureWindow, CAPTURE_PATH], [islandWindow, ISLAND_PATH]] as const) {
      if (!win || win.isDestroyed() || win.isVisible()) continue;
      if (needsLoad(win.webContents.getURL(), appOrigin, path)) void win.loadURL(`${appOrigin}${path}`);
    }
  }

  /**
   * The music folder (one, replaced) or a videos folder (added; the same
   * folder again is the same root). Null when the dialog was closed.
   */
  async function pickRoot(kind: Root["kind"]): Promise<Root | null> {
    const parent = shownWindow();
    const options = { title: kind === "music" ? "Choose your music folder" : "Choose a folder of videos", properties: ["openDirectory", "dontAddToRecent"] as ("openDirectory" | "dontAddToRecent")[] };
    const picked = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
    const path = picked.filePaths[0];
    if (picked.canceled || !path) return null;
    const same = roots.find((r) => r.kind === kind && r.path.toLowerCase() === path.toLowerCase());
    if (same) return same;
    const root: Root = { id: newRootId(), kind, path, name: basename(path) || path };
    const kept = kind === "music" ? roots.filter((r) => r.kind !== "music") : roots;
    const ofKind = kept.filter((r) => r.kind === kind);
    // The oldest videos folder goes when there are too many, and the owner is told which.
    const dropped = ofKind.length >= MAX_ROOTS ? ofKind[0] : undefined;
    setRoots([...kept.filter((r) => r !== dropped), root]);
    if (dropped) {
      void showBox({
        type: "info",
        title: "Wanheda",
        message: `Wanheda now plays videos from ${String(MAX_ROOTS)} folders at most, so it let go of "${dropped.name}".`,
        detail: "Its videos stay in your list; open that folder again to play them.",
        buttons: ["OK"],
      });
    }
    return root;
  }

  /** Saves the roots and keeps one watch per root. */
  function setRoots(next: Root[]): void {
    roots = next;
    try {
      saveRoots(userData, roots);
    } catch (err) {
      log.info(`couldn't save the folders: ${errText(err)}`);
    }
    for (const [id, stop] of rootWatches) {
      if (roots.some((r) => r.id === id)) continue;
      stop();
      rootWatches.delete(id);
    }
    for (const root of roots) watch(root);
  }

  /** Changes on disk, settled, tell the page to catch its index up (V72). */
  function watch(root: Root): void {
    if (rootWatches.has(root.id)) return;
    rootWatches.set(
      root.id,
      watchRoot(root, () => {
        const win = mainWindow;
        if (win && !win.isDestroyed()) win.webContents.send(CHANNELS.filesChanged, root.id);
      }),
    );
  }

  /** Shows or hides the island for the main window's state, the setting and what's live. */
  function updateIsland(): void {
    const win = islandWindow;
    const main = mainWindow;
    if (!win || win.isDestroyed()) return;
    const mainUp = Boolean(main && !main.isDestroyed());
    const show = shouldShowIsland({
      enabled: settings.island,
      content: islandReport.content,
      mainVisible: mainUp && Boolean(main?.isVisible()),
      mainMinimized: mainUp && Boolean(main?.isMinimized()),
      mainFocused: mainUp && Boolean(main?.isFocused()),
      quitting: quitting !== "no",
    });
    if (show && !win.isVisible()) {
      const display = main && !main.isDestroyed() ? screen.getDisplayMatching(main.getBounds()) : screen.getPrimaryDisplay();
      const at = islandPosition(display.workArea);
      win.setPosition(at.x, at.y);
      win.showInactive();
    } else if (!show && win.isVisible()) {
      win.hide();
    }
    trackIslandCursor(show);
    if (show !== islandFloating) {
      islandFloating = show;
      if (main && !main.isDestroyed()) main.webContents.send(CHANNELS.islandFloating, show);
    }
  }

  /**
   * While the island shows, ~30 times a second: the cursor over the island
   * takes mouse events (hover, clicks); anywhere else they pass through to
   * what's below. `forward: true` delivered no hover on Windows (ADR-0014 (c)).
   */
  function trackIslandCursor(on: boolean): void {
    if (!on) {
      if (islandTimer) clearInterval(islandTimer);
      islandTimer = null;
      setIslandHover(false);
      return;
    }
    if (islandTimer) return;
    islandTimer = setInterval(() => {
      const win = islandWindow;
      if (!win || win.isDestroyed()) return;
      const [x = 0, y = 0] = win.getPosition();
      setIslandHover(overIsland(screen.getCursorScreenPoint(), { x, y }, islandReport.rect));
    }, 33);
  }

  function setIslandHover(over: boolean): void {
    if (over === islandHover) return;
    islandHover = over;
    const win = islandWindow;
    if (!win || win.isDestroyed()) return;
    win.setIgnoreMouseEvents(!over);
    win.webContents.send(CHANNELS.islandHover, over);
  }

  /** Shows quick capture centred near the top of the screen the cursor is on, focused. */
  function showCapture(): void {
    const win = createCaptureWindow();
    if (!win || !appOrigin) return;
    // Loaded while signed out, it's on the sign-in page: load the capture page again now.
    if (needsLoad(win.webContents.getURL(), appOrigin, CAPTURE_PATH)) void win.loadURL(`${appOrigin}${CAPTURE_PATH}`);
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    win.setPosition(Math.round(area.x + (area.width - CAPTURE_SIZE.width) / 2), Math.round(area.y + area.height * 0.2));
    win.show();
    win.focus();
  }

  /** Shows an allowed path in the main window: routed by the page if it's up, else loaded. */
  function openInApp(path: string): void {
    const safe = openPath(path);
    const win = mainWindow;
    if (!safe || !appOrigin || !win || win.isDestroyed()) return;
    const contents = win.webContents;
    let onApp = false;
    try {
      onApp = new URL(contents.getURL()).origin === appOrigin;
    } catch {
      // The splash page (data:) or nothing yet.
    }
    if (onApp && !contents.isLoading()) contents.send(CHANNELS.open, safe);
    else void win.loadURL(`${appOrigin}${safe}`);
  }

  function background(): string {
    return nativeTheme.shouldUseDarkColors ? "#050a0b" : "#f3f3f1";
  }

  /** What the View menu's item does for that key. Zoom steps match Chromium's menu roles (0.5 a step). */
  function runMenuKey(win: BrowserWindow, key: MenuKey): void {
    const contents = win.webContents;
    if (key === "zoomIn") contents.setZoomLevel(Math.min(contents.getZoomLevel() + 0.5, 9));
    else if (key === "zoomOut") contents.setZoomLevel(Math.max(contents.getZoomLevel() - 0.5, -8));
    else if (key === "resetZoom") contents.setZoomLevel(0);
    else if (key === "reload") contents.reload();
    else if (key === "forceReload") contents.reloadIgnoringCache();
    else if (key === "toggleDevTools") contents.toggleDevTools();
    else win.setFullScreen(!win.isFullScreen());
  }

  /**
   * Windows' caption buttons over the page's own title bar (components/shell/title-bar.tsx),
   * the way VS Code does it: the page's colours once it has said them, the splash's until then.
   */
  function titleBarOverlay(): { color: string; symbolColor: string; height: number } {
    const color = titleBarColors?.color ?? background();
    const symbolColor = titleBarColors?.symbol ?? (nativeTheme.shouldUseDarkColors ? "#9aa3a5" : "#5b5f61");
    return { color, symbolColor, height: TITLE_BAR_HEIGHT };
  }

  function createWindow(): BrowserWindow {
    const place = placeWindow(loadWindowState(userData), screenAreas());
    const win = new BrowserWindow({
      width: place.width,
      height: place.height,
      ...(place.x !== undefined && place.y !== undefined ? { x: place.x, y: place.y } : {}),
      minWidth: MIN_SIZE.width,
      minHeight: MIN_SIZE.height,
      show: false,
      title: "Wanheda",
      icon: join(app.getAppPath(), "icon.png"),
      backgroundColor: background(),
      autoHideMenuBar: true,
      // No Windows title bar: the page draws its own, under Windows' caption buttons.
      titleBarStyle: "hidden",
      titleBarOverlay: titleBarOverlay(),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: false,
        devTools: !app.isPackaged,
        spellcheck: true,
        backgroundThrottling: !settings.keepRunning,
        // Bundled next to main.js; Bun.build bakes __dirname in as the source folder, so ask Electron.
        preload: join(app.getAppPath(), "preload.js"),
      },
    });
    win.once("ready-to-show", () => {
      if (!place.maximized) { win.show(); return; }
      // maximize() shows the window too, but doesn't focus it.
      win.maximize();
      win.focus();
    });
    rememberPlace(win);
    hideOnClose(win);
    // With no menu bar the app menu's own accelerators don't run (menu-keys.ts).
    win.webContents.on("before-input-event", (event, input) => {
      const key = menuKey(input, !app.isPackaged);
      if (!key) return;
      event.preventDefault();
      runMenuKey(win, key);
    });
    // Windows log-off or shutdown: stop the server cleanly while we still can.
    win.on("session-end", () => {
      sessionEnding = true;
      void Promise.allSettled([session.defaultSession.cookies.flushStore(), server?.stop()]);
    });
    void win.loadURL(appOrigin ? `${appOrigin}${START_PATH}` : splash(background()));
    // A new page (a reload, a server restart) starts with nothing playing: let the media keys go
    // until it says otherwise, or they'd be swallowed with no one to take them.
    win.webContents.on("did-navigate", () => {
      pageReady = false;
      holdMediaKeys(false);
      // The new page publishes its own snapshot once its shell is up; until then nothing is live.
      islandFloating = false;
      islandSnapshot = EMPTY_SNAPSHOT;
      if (islandWindow && !islandWindow.isDestroyed()) islandWindow.webContents.send(CHANNELS.islandSnapshot, EMPTY_SNAPSHOT);
    });
    for (const change of ["focus", "blur", "show", "hide", "minimize", "restore"] as const) {
      win.on(change as "focus", () => { updateIsland(); });
    }
    win.webContents.on("render-process-gone", () => {
      pageReady = false;
      holdMediaKeys(false);
    });
    // Really closed (keep running is off): the hidden capture window must not keep Wanheda alive.
    win.on("closed", () => {
      if (captureWindow && !captureWindow.isDestroyed()) captureWindow.destroy();
      captureWindow = null;
      trackIslandCursor(false);
      if (islandWindow && !islandWindow.isDestroyed()) islandWindow.destroy();
      islandWindow = null;
      islandSnapshot = EMPTY_SNAPSHOT;
      islandReport = { content: false, rect: null };
      pageReady = false;
      holdMediaKeys(false);
    });
    mainWindow = win;
    // Made again after the main window really closed (keep running off, then the tray or a link):
    // the island went with it, so it comes back with it. At start, start() makes it once the server is up.
    if (appOrigin) createIslandWindow();
    return win;
  }

  /**
   * GitHub or Google sign-in (V68). Packaged and preview: the provider's pages
   * open in the default browser, like VS Code's and gh's sign-in, and the
   * server hands the browser's return to finishSignIn. Dev (`next dev`, no
   * token gate to catch that return): GitHub uses the auth window below;
   * Google refuses embedded browsers, so it needs a preview or packaged build.
   */
  function startOAuthSignIn(provider: Provider, url: string): void {
    if (mode === "dev") {
      if (provider === "github") openAuthWindow(url);
      else log.info("sign-in: Google needs the system browser, which dev can't catch coming back; use desktop:preview");
      return;
    }
    const started = signInFrom(url, appOrigin, Date.now());
    if (!started) {
      log.info(`sign-in: ${provider}'s page doesn't come back to this app; not opened`);
      return;
    }
    pendingSignIn = started;
    void shell.openExternal(url);
    log.info(`sign-in: ${provider} opened in the browser`);
  }

  /** The browser came back from the provider: finish in the app's window, which holds the state cookie and the token. */
  function finishSignIn(provider: Provider, search: string): void {
    const query = callbackQuery(provider, search, pendingSignIn, Date.now());
    if (!query || !appOrigin) {
      log.info("sign-in: a callback that doesn't answer this app's sign-in was ignored");
      return;
    }
    pendingSignIn = null;
    showWindow();
    const target = mainWindow;
    if (!target || target.isDestroyed()) return;
    void target.loadURL(`${appOrigin}${CALLBACK_PATHS[provider]}?${query}`);
    log.info("sign-in: back from the browser");
  }

  /**
   * Dev only. GitHub's OAuth pages in their own window (V68, ADR-0014): no preload, the
   * app's session (so the callback's cookie lands where the app reads it),
   * and only GitHub's sign-in pages and the app's callback. Reaching the
   * app's origin ends it: the window closes and the main window goes there.
   */
  function openAuthWindow(url: string): void {
    if (authWindow && !authWindow.isDestroyed()) {
      void authWindow.loadURL(url);
      authWindow.focus();
      return;
    }
    const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
    const win = new BrowserWindow({
      width: 520,
      height: 760,
      ...(parent ? { parent } : {}),
      title: "Sign in with GitHub",
      autoHideMenuBar: true,
      backgroundColor: background(),
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false, devTools: !app.isPackaged },
    });
    const id = win.webContents.id;
    authContents.add(id);
    win.on("closed", () => {
      authContents.delete(id);
      if (authWindow === win) authWindow = null;
    });
    win.webContents.on("did-navigate", (_event, landed) => {
      const step = classifyAuthUrl(landed, appOrigin);
      if (step.kind !== "app") return;
      const target = mainWindow;
      win.close();
      if (target && !target.isDestroyed()) {
        void target.loadURL(step.url);
        showWindow();
      }
    });
    authWindow = win;
    void win.loadURL(url);
  }

  /** Saves the window's size and place a moment after it changes, and when it closes. */
  function rememberPlace(win: BrowserWindow): void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      clearTimeout(timer);
      if (win.isDestroyed()) return;
      try {
        saveWindowState(userData, { bounds: win.getNormalBounds(), maximized: win.isMaximized() });
      } catch (err) {
        log.info(`couldn't save the window's place: ${errText(err)}`);
      }
    };
    const later = () => {
      clearTimeout(timer);
      timer = setTimeout(save, 500);
    };
    win.on("resize", later);
    win.on("move", later);
    win.on("maximize", later);
    win.on("unmaximize", later);
    win.on("close", save);
  }

  /** Permissions: the allowlist, for the app's own origin only (V67). */
  function hardenSession(ses: Session): void {
    ses.setPermissionRequestHandler((contents, permission, callback, details) => {
      callback(permissionAllowed(permission, details.requestingUrl, contents.getURL(), appOrigin));
    });
    ses.setPermissionCheckHandler((contents, permission, requestingOrigin, details) => {
      const page = contents?.getURL() ?? details.embeddingOrigin ?? "";
      return permissionAllowed(permission, details.requestingUrl ?? requestingOrigin, page, appOrigin);
    });
  }

  /**
   * Adds the token to requests for the server only (never to other sites, and
   * page script never sees it) and tracks them. The CSP comes from the server
   * itself (next.config.ts). Each call replaces the listeners, so a moved port re-routes.
   */
  function routeToken(ses: Session, origin: string): void {
    const filter = { urls: [`${origin}/*`] };
    const ours = (url: string) => new URL(url).origin === origin;
    ses.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
      const requestHeaders = details.requestHeaders;
      if (ours(details.url)) requestHeaders[TOKEN_HEADER] = token;
      callback({ requestHeaders });
    });
    ses.webRequest.onSendHeaders(filter, (details) => {
      if (ours(details.url)) inFlight.add(details.id);
    });
    ses.webRequest.onCompleted(filter, (details) => void inFlight.delete(details.id));
    ses.webRequest.onErrorOccurred(filter, (details) => void inFlight.delete(details.id));
  }

  function harden(contents: WebContents): void {
    const isAuth = () => authContents.has(contents.id);
    contents.setWindowOpenHandler(({ url }) => {
      if (isAuth()) {
        const step = classifyAuthUrl(url, appOrigin);
        if (step.kind === "external") void shell.openExternal(step.url);
        return { action: "deny" };
      }
      const destination = classifyUrl(url, appOrigin);
      if (destination.kind === "app") {
        return {
          action: "allow",
          overrideBrowserWindowOptions: {
            autoHideMenuBar: true,
            webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false, devTools: !app.isPackaged },
          },
        };
      }
      if (destination.kind === "oauth-sign-in") startOAuthSignIn(destination.provider, destination.url);
      else if (destination.kind === "external") void shell.openExternal(destination.url);
      return { action: "deny" };
    });
    const guard = (event: { url: string; isMainFrame: boolean; preventDefault(): void }) => {
      const step = navigationStep({ url: event.url, isMainFrame: event.isMainFrame, isAuth: isAuth() }, appOrigin);
      if (step.kind === "allow") return;
      event.preventDefault();
      if (step.kind === "oauth-sign-in") startOAuthSignIn(step.provider, step.url);
      else if (step.kind === "external") void shell.openExternal(step.url);
    };
    contents.on("will-navigate", (event) => { guard(event); });
    contents.on("will-redirect", (event) => { guard(event); });
    contents.on("will-attach-webview", (event) => { event.preventDefault(); });
    // A page that blocks leaving with beforeunload: Electron would silently
    // keep the window open, so ask instead.
    contents.on("will-prevent-unload", (event) => {
      const win = BrowserWindow.fromWebContents(contents);
      const options = {
        type: "question" as const,
        title: "Wanheda",
        message: "Wanheda is still working.",
        detail: "Something may still be saving. If you leave now, it may not finish.",
        buttons: ["Stay", "Leave"],
        defaultId: 0,
        cancelId: 0,
      };
      const choice = win ? dialog.showMessageBoxSync(win, options) : dialog.showMessageBoxSync(options);
      if (choice === 1) event.preventDefault();
    });
  }
}

/**
 * Where the speech process and its native addon live: resources/speech when
 * installed, next to the staged app in preview, and the dev bundle (sherpa
 * then resolves from desktop/node_modules) in dev.
 */
function speechDir(): string {
  if (app.isPackaged) return join(process.resourcesPath, "speech");
  return mode === "preview" ? join(app.getAppPath(), "..", "speech") : join(app.getAppPath(), "speech");
}

/** Every display's work area, primary first. */
function screenAreas(): Rect[] {
  const primary = screen.getPrimaryDisplay();
  return [primary, ...screen.getAllDisplays().filter((display) => display.id !== primary.id)].map((display) => display.workArea);
}

/** Resolves true once every window is gone, false if one stayed open (the owner chose "Stay"). */
async function closeWindows(): Promise<boolean> {
  await Promise.all(
    BrowserWindow.getAllWindows().map(
      (win) =>
        new Promise<void>((resolve) => {
          if (win.isDestroyed()) { resolve(); return; }
          win.once("closed", () => { resolve(); });
          setTimeout(resolve, 3000);
          win.close();
        }),
    ),
  );
  return BrowserWindow.getAllWindows().length === 0;
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

type MenuActions = { setKeepRunning: (on: boolean) => void; importEnv: () => void; useDemo: () => void };

function buildMenu(keepRunning: boolean, actions: MenuActions): Menu {
  const fileMenu: MenuItemConstructorOptions = {
    label: "File",
    submenu: [
      { label: KEEP_RUNNING_LABEL, type: "checkbox", checked: keepRunning, click: (item) => { actions.setKeepRunning(item.checked); } },
      { type: "separator" },
      { label: "Import .env file…", click: () => { actions.importEnv(); } },
      { label: "Use demo mode…", click: () => { actions.useDemo(); } },
      { type: "separator" },
      { role: "quit", label: "Quit Wanheda" },
    ],
  };
  const view: MenuItemConstructorOptions[] = [
    { role: "reload" },
    { role: "forceReload" },
    ...(app.isPackaged ? [] : [{ role: "toggleDevTools" } as const]),
    { type: "separator" },
    { role: "resetZoom" },
    { role: "zoomIn" },
    { role: "zoomOut" },
    { type: "separator" },
    { role: "togglefullscreen" },
  ];
  return Menu.buildFromTemplate([fileMenu, { role: "editMenu" }, { label: "View", submenu: view }, { role: "windowMenu" }]);
}

/** The main window's title bar height (the caption buttons' overlay), in DIPs: Windows' own. */
const TITLE_BAR_HEIGHT = 32;

function splash(color: string): string {
  const ink = color === "#050a0b" ? "#9aa3a5" : "#5b5f61";
  // The window has no Windows title bar, so the splash's top strip drags it.
  return `data:text/html;charset=utf-8,${encodeURIComponent(
    `<!doctype html><meta charset="utf-8"><title>Wanheda</title><style>html,body{height:100%;margin:0;background:${color};color:${ink};font:14px system-ui,sans-serif;display:grid;place-items:center}i{position:fixed;inset:0 0 auto;height:${TITLE_BAR_HEIGHT}px;app-region:drag}</style><i></i><p>Starting Wanheda…</p>`,
  )}`;
}
