/*
 * The View menu's keys, handled by main itself. The main window has no
 * Windows title bar or menu bar (the page draws its own title bar), and
 * Electron only runs a hidden application menu's accelerators while its menu
 * bar exists. So main reads these keys in `before-input-event` and stops them
 * there, which also stops the menu and the page from acting on them twice.
 * Edit keys (copy, paste, undo, select all) need no menu: Chromium handles them.
 */

export type MenuKey = "zoomIn" | "zoomOut" | "resetZoom" | "reload" | "forceReload" | "toggleDevTools" | "toggleFullScreen";

/** The fields of Electron's `Input` this reads. */
export type KeyInput = { type: string; key: string; code: string; control: boolean; shift: boolean; alt: boolean; meta: boolean };

export function menuKey(input: KeyInput, devTools: boolean): MenuKey | null {
  if (input.type !== "keyDown" || input.alt || input.meta) return null;
  if (!input.control) return input.code === "F11" && !input.shift ? "toggleFullScreen" : null;
  switch (input.code) {
    case "Equal":
    case "NumpadAdd":
      return "zoomIn";
    case "Minus":
    case "NumpadSubtract":
      return "zoomOut";
    case "Digit0":
    case "Numpad0":
      return input.shift ? null : "resetZoom";
    case "KeyR":
      return input.shift ? "forceReload" : "reload";
    case "KeyI":
      return input.shift && devTools ? "toggleDevTools" : null;
    default:
      return null;
  }
}
