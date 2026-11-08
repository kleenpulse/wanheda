import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { CHANNELS } from "./bridge";

/*
 * Runs sandboxed in the main window's top frame before the page (SPEC V67).
 * It has no Node.js and exposes one typed object, `window.wanheda`; main
 * checks everything that crosses (bridge.ts). The auth window and child
 * windows don't get it. lib/platform/desktop.ts holds the page's types.
 */

contextBridge.exposeInMainWorld("wanheda", {
  desktop: true,
  onOpen(callback: (path: string) => void): () => void {
    const listener = (_event: IpcRendererEvent, path: unknown) => {
      if (typeof path === "string") callback(path);
    };
    ipcRenderer.on(CHANNELS.open, listener);
    return () => void ipcRenderer.removeListener(CHANNELS.open, listener);
  },
});
