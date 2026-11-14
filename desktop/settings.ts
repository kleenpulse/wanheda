import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SHORTCUTS, parseShortcuts, type ShortcutId } from "./shortcuts";
import { MAX_ISLAND_OFFSET } from "./island";

/*
 * Settings the desktop shell owns (the page's own settings live in the
 * page), kept in settings.json next to window-state.json.
 */

export type DesktopSettings = {
  /** Closing the window hides it, and Wanheda keeps running (music, timers, speech). */
  keepRunning: boolean;
  /** The "Wanheda is still running" notice was shown once already. */
  trayHintShown: boolean;
  /** The floating island while Wanheda is in the background (V70). */
  island: boolean;
  /** Where the owner dragged the floating island along the top of the screen: px right (+) or left (−) of centre. */
  islandOffset: number;
  /** Global shortcuts (V71): an accelerator, or null when turned off. */
  shortcuts: Record<ShortcutId, string | null>;
  /** A new version downloads as soon as it's found. Off: Wanheda offers it and downloads on the owner's click (a metered line). */
  autoDownloadUpdates: boolean;
  /**
   * The last version the updater downloaded. Found again after a quit, it downloads by itself even with
   * automatic downloads off: the cached installer answers at once, so "Restart to update" comes back.
   */
  downloadedUpdate: string | null;
};

const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

export const DEFAULT_SETTINGS: DesktopSettings = {
  keepRunning: true,
  trayHintShown: false,
  island: true,
  islandOffset: 0,
  shortcuts: { ...DEFAULT_SHORTCUTS },
  autoDownloadUpdates: false,
  downloadedUpdate: null,
};

/** Known keys with the right type win; anything else falls back to the default. */
export function parseSettings(text: string | null): DesktopSettings {
  if (!text) return defaults();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return defaults();
  }
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const flag = (key: "keepRunning" | "trayHintShown" | "island" | "autoDownloadUpdates") =>(typeof record[key] === "boolean" ? record[key] : DEFAULT_SETTINGS[key]);
  const offset = record.islandOffset;
  return {
    keepRunning: flag("keepRunning"),
    trayHintShown: flag("trayHintShown"),
    island: flag("island"),
    // Clamped to the display when it is used; here only a sane number.
    islandOffset: typeof offset === "number" && Number.isFinite(offset) && Math.abs(offset) <= MAX_ISLAND_OFFSET ? Math.round(offset) : DEFAULT_SETTINGS.islandOffset,
    shortcuts: parseShortcuts(record.shortcuts),
    autoDownloadUpdates: flag("autoDownloadUpdates"),
    downloadedUpdate: typeof record.downloadedUpdate === "string" && VERSION.test(record.downloadedUpdate) ? record.downloadedUpdate : null,
  };
}

function defaults(): DesktopSettings {
  return { ...DEFAULT_SETTINGS, shortcuts: { ...DEFAULT_SHORTCUTS } };
}

function settingsFile(userData: string): string {
  return join(userData, "settings.json");
}

export function loadSettings(userData: string): DesktopSettings {
  try {
    return parseSettings(readFileSync(settingsFile(userData), "utf8"));
  } catch {
    return defaults();
  }
}

export function saveSettings(userData: string, settings: DesktopSettings): void {
  const path = settingsFile(userData);
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(settings, null, 2)}\n`);
  renameSync(tmp, path);
}
