import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SHORTCUTS, parseShortcuts, type ShortcutId } from "./shortcuts";

/*
 * Settings the desktop shell owns (the page's own settings live in the
 * page), kept in settings.json next to window-state.json.
 */

export type DesktopSettings = {
  /** Closing the window hides it, and Wanheda keeps running (music, timers, speech). */
  keepRunning: boolean;
  /** The "Wanheda is still running" notice was shown once already. */
  trayHintShown: boolean;
  /** Global shortcuts (V71): an accelerator, or null when turned off. */
  shortcuts: Record<ShortcutId, string | null>;
};

export const DEFAULT_SETTINGS: DesktopSettings = { keepRunning: true, trayHintShown: false, shortcuts: { ...DEFAULT_SHORTCUTS } };

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
  const flag = (key: "keepRunning" | "trayHintShown") => (typeof record[key] === "boolean" ? record[key] : DEFAULT_SETTINGS[key]);
  return { keepRunning: flag("keepRunning"), trayHintShown: flag("trayHintShown"), shortcuts: parseShortcuts(record.shortcuts) };
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
