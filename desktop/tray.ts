import { app, Menu, nativeImage, Tray } from "electron";
import { join } from "node:path";

/*
 * The tray icon. Clicking it shows the window; its menu opens Wanheda, turns
 * "keep running" on or off, and quits.
 */

export type TrayActions = {
  open: () => void;
  keepRunning: () => boolean;
  setKeepRunning: (on: boolean) => void;
  quit: () => void;
};

export type WanhedaTray = { refresh(): void; destroy(): void };

export function createTray(actions: TrayActions): WanhedaTray {
  // tray@2x.png sits next to it and is picked up on high-DPI screens.
  const icon = nativeImage.createFromPath(join(app.getAppPath(), "tray.png"));
  const tray = new Tray(icon);
  tray.setToolTip("Wanheda");
  const refresh = () => {
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Open Wanheda", click: actions.open },
        { type: "separator" },
        { label: KEEP_RUNNING_LABEL, type: "checkbox", checked: actions.keepRunning(), click: (item) => { actions.setKeepRunning(item.checked); } },
        { type: "separator" },
        { label: "Quit Wanheda", click: actions.quit },
      ]),
    );
  };
  tray.on("click", actions.open);
  refresh();
  return { refresh, destroy: () => { tray.destroy(); } };
}

export const KEEP_RUNNING_LABEL = "Keep running when the window is closed";
