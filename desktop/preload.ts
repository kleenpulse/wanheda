import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { CHANNELS, type Command, type DesktopChange, type DesktopNotice, type DesktopSetResult, type DesktopState, type SecretsAction } from "./bridge";
import type { IslandCommand, IslandReport, IslandSnapshot } from "./island";

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
    secrets: (action: SecretsAction): Promise<DesktopState> => ipcRenderer.invoke(CHANNELS.secrets, action),
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
  },
  capture: {
    save: (text: string): Promise<boolean> => ipcRenderer.invoke(CHANNELS.capture, text),
    close(): void {
      ipcRenderer.send(CHANNELS.captureClose);
    },
  },
});
