import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from "electron";
import { BRIDGE_VERSION, CHANNELS, type Command, type DesktopChange, type DesktopNotice, type DesktopSetResult, type DesktopState, type MenuAnchor, type TitleBarColors } from "./bridge";
import type { ListedFile, Root, RootKind } from "./files";
import type { IslandCommand, IslandDrag, IslandReport, IslandSnapshot } from "./island";

/*
 * Runs sandboxed in the top frame of the main window and the quick-capture
 * window, before the page (SPEC V67). It has no Node.js and exposes one typed
 * object, `window.wanheda`. Main checks every message: who sent it (which
 * window, its top frame, the app's origin) and what it holds (bridge.ts), so
 * a call from the wrong window is ignored. The auth window and child windows
 * don't get it. lib/platform/desktop.ts holds the page's types.
 */

function subscribe<T>(channel: string, accept: (value: unknown) => value is T, callback: (value: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, value: unknown) => {
    if (accept(value)) callback(value);
  };
  ipcRenderer.on(channel, listener);
  return () => void ipcRenderer.removeListener(channel, listener);
}

const isString = (value: unknown): value is string => typeof value === "string";
// Main builds these itself; the page checks commands again (lib/platform/desktop.ts).
const isCommand = (value: unknown): value is Command => Boolean(value) && typeof value === "object";
const isState = (value: unknown): value is DesktopState => Boolean(value) && typeof value === "object";
const isSnapshot = (value: unknown): value is IslandSnapshot => Boolean(value) && typeof value === "object";
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

contextBridge.exposeInMainWorld("wanheda", {
  desktop: true,
  version: BRIDGE_VERSION,
  onOpen: (callback: (path: string) => void) => subscribe(CHANNELS.open, isString, callback),
  onCommand: (callback: (command: Command) => void) => subscribe(CHANNELS.command, isCommand, callback),
  notify(notice: DesktopNotice): void {
    ipcRenderer.send(CHANNELS.notify, notice);
  },
  setMediaActive(active: boolean): void {
    ipcRenderer.send(CHANNELS.media, active);
  },
  setCommandsReady(ready: boolean): void {
    ipcRenderer.send(CHANNELS.commandsReady, ready);
  },
  settings: {
    get: (): Promise<DesktopState> => ipcRenderer.invoke(CHANNELS.desktopState),
    set: (change: DesktopChange): Promise<DesktopSetResult> => ipcRenderer.invoke(CHANNELS.desktopSet, change),
    onChange: (callback: (state: DesktopState) => void) => subscribe(CHANNELS.desktopChanged, isState, callback),
  },
  island: {
    /** Main window: what's live. */
    publish(snapshot: IslandSnapshot): void {
      ipcRenderer.send(CHANNELS.islandPublish, snapshot);
    },
    /** Main window: the floating island is up (true) or not. */
    onFloating: (callback: (floating: boolean) => void) => subscribe(CHANNELS.islandFloating, isBoolean, callback),
    /** Island window: the latest snapshot, then every new one. */
    get: (): Promise<IslandSnapshot | null> => ipcRenderer.invoke(CHANNELS.islandGet),
    onSnapshot: (callback: (snapshot: IslandSnapshot) => void) => subscribe(CHANNELS.islandSnapshot, isSnapshot, callback),
    onHover: (callback: (over: boolean) => void) => subscribe(CHANNELS.islandHover, isBoolean, callback),
    report(report: IslandReport): void {
      ipcRenderer.send(CHANNELS.islandReport, report);
    },
    command(command: IslandCommand): void {
      ipcRenderer.send(CHANNELS.islandCommand, command);
    },
    /** Island window: a drag along the top of the screen. */
    drag(drag: IslandDrag): void {
      ipcRenderer.send(CHANNELS.islandDrag, drag);
    },
  },
  files: {
    roots: (): Promise<Root[]> => ipcRenderer.invoke(CHANNELS.filesRoots),
    pick: (kind: RootKind): Promise<Root | null> => ipcRenderer.invoke(CHANNELS.filesPick, kind),
    list: (rootId: string): Promise<{ files: ListedFile[]; complete: boolean }> => ipcRenderer.invoke(CHANNELS.filesList, rootId),
    forget: (rootId: string): Promise<void> => ipcRenderer.invoke(CHANNELS.filesForget, rootId),
    onChanged: (callback: (rootId: string) => void) => subscribe(CHANNELS.filesChanged, isString, callback),
  },
  tts: {
    has: (voice: string): Promise<boolean> => ipcRenderer.invoke(CHANNELS.ttsHas, voice),
    install: (voice: string, model: ArrayBuffer, config: string): Promise<boolean> => ipcRenderer.invoke(CHANNELS.ttsInstall, { voice, model, config }),
    synth: (voice: string, codepoints: number[], rate: number): Promise<{ samples: Float32Array; sampleRate: number; synthMs: number }> =>
      ipcRenderer.invoke(CHANNELS.ttsSynth, { voice, codepoints, rate }),
    drop: (voice: string): Promise<void> => ipcRenderer.invoke(CHANNELS.ttsDrop, voice),
  },
  media: {
    transcodable: (): Promise<string[]> => ipcRenderer.invoke(CHANNELS.mediaTranscodable),
    /** The path comes from the File itself, here, so page script can never name one. */
    grant(file: File): Promise<string | null> {
      let path = "";
      try {
        path = webUtils.getPathForFile(file);
      } catch {
        // not a File from this device
      }
      return path ? ipcRenderer.invoke(CHANNELS.mediaGrant, path) : Promise.resolve(null);
    },
  },
  capture: {
    save: (text: string): Promise<boolean> => ipcRenderer.invoke(CHANNELS.capture, text),
    close(): void {
      ipcRenderer.send(CHANNELS.captureClose);
    },
  },
  auth: {
    /** Main window: sign in through the system browser (ADR-0016). */
    signInWithBrowser: (): Promise<boolean> => ipcRenderer.invoke(CHANNELS.signInBrowser),
  },
  titleBar: {
    colors(colors: TitleBarColors): void {
      ipcRenderer.send(CHANNELS.titleBarColors, colors);
    },
    menu(anchor: MenuAnchor): void {
      ipcRenderer.send(CHANNELS.titleBarMenu, anchor);
    },
  },
});
