import { app, Menu, nativeImage, Tray, type MenuItemConstructorOptions } from "electron";
import { join } from "node:path";
import { CHECK_FOR_UPDATES_LABEL } from "./update-state";

/*
 * The tray icon. Clicking it shows the window; its menu opens Wanheda, offers
 * a downloaded update, turns "keep running" on or off, checks for updates,
 * and quits.
 */

export type TrayActions = {
  open: () => void;
  keepRunning: () => boolean;
  setKeepRunning: (on: boolean) => void;
  /** Only in builds that update themselves (not dev or preview). */
  checkForUpdates?: () => void;
  /** "Restart to update to x.y.z", once an update is ready. */
  update?: () => { label: string; click: () => void } | null;
  quit: () => void;
};

export type WanhedaTray = { refresh(): void; destroy(): void };

export function createTray(actions: TrayActions): WanhedaTray {
  // tray@2x.png sits next to it and is picked up on high-DPI screens.
  const icon = nativeImage.createFromPath(join(app.getAppPath(), "tray.png"));
  const tray = new Tray(icon);
  tray.setToolTip("Wanheda");
  const refresh = () => {
    const update = actions.update?.() ?? null;
    const { checkForUpdates } = actions;
    const items: MenuItemConstructorOptions[] = [
      { label: "Open Wanheda", click: actions.open },
      ...(update ? [{ label: update.label, click: update.click }] : []),
      { type: "separator" },
      { label: KEEP_RUNNING_LABEL, type: "checkbox", checked: actions.keepRunning(), click: (item) => { actions.setKeepRunning(item.checked); } },
      ...(checkForUpdates ? [{ label: CHECK_FOR_UPDATES_LABEL, click: () => { checkForUpdates(); } }] : []),
      { type: "separator" },
      { label: "Quit Wanheda", click: actions.quit },
    ];
    tray.setContextMenu(Menu.buildFromTemplate(items));
  };
  tray.on("click", actions.open);
  refresh();
  return { refresh, destroy: () => { tray.destroy(); } };
}

export const KEEP_RUNNING_LABEL = "Keep running when the window is closed";
