/*
 * The page ↔ main bridge (preload.ts exposes it as `window.wanheda`). Channel
 * names and every check on what crosses live here, pure and tested (SPEC
 * V67): main never trusts what the page sends, and only sends paths it knows
 * the app has.
 */

import type { IslandCommand } from "./island";
import { isShortcutId, parseAccelerator, type MediaCommand, type ShortcutId } from "./shortcuts";

/**
 * What this shell's bridge offers, as a number the page can compare (ADR-0016):
 * the page is the hosted app and updates with every deploy, the shell only with
 * the installer. Raise it when the bridge gains something a page must detect.
 * 1 = T88 (the hosted app; `settings.secrets` gone when `state.secrets` is null).
 */
export const BRIDGE_VERSION = 1;

export const CHANNELS = {
  /** main → page: show this path in the app (a `wanheda://` link was opened). */
  open: "wanheda:open",
  /** main → page: a global shortcut or the capture window asked for something (`Command`). */
  command: "wanheda:command",
  /** page → main: a notice for a system notification (`DesktopNotice`). */
  notify: "wanheda:notify",
  /** page → main: whether something can play now (an audible owner, V60), so main holds the media keys. */
  media: "wanheda:media",
  /** page ⇄ main (invoke): Settings → Desktop reads its state. */
  desktopState: "wanheda:desktop-state",
  /** page ⇄ main (invoke): Settings → Desktop changes one thing (`DesktopChange`). */
  desktopSet: "wanheda:desktop-set",
  /** page ⇄ main (invoke): import a `.env` file again, or forget the keys (demo mode). */
  secrets: "wanheda:secrets",
  /** main → page: the desktop state changed (`DesktopState`). */
  desktopChanged: "wanheda:desktop-changed",
  /** capture window ⇄ main (invoke): save this text as a note. */
  capture: "wanheda:capture",
  /** capture window → main: hide the capture window. */
  captureClose: "wanheda:capture-close",
  /** page → main: whether this page takes commands (the shell's listener is mounted: signed in, in the shell). */
  commandsReady: "wanheda:commands-ready",
  /** main window page → main: what's live, for the floating island (`IslandSnapshot`). */
  islandPublish: "wanheda:island-publish",
  /** main → main window page: whether the floating island is up, so the page's own island steps aside. */
  islandFloating: "wanheda:island-floating",
  /** main → island window: the latest snapshot. */
  islandSnapshot: "wanheda:island-snapshot",
  /** island window ⇄ main (invoke): the latest snapshot, once it has loaded. */
  islandGet: "wanheda:island-get",
  /** island window → main: whether it has anything to show, and where the island sits (`IslandReport`). */
  islandReport: "wanheda:island-report",
  /** main → island window: whether the cursor is over the island (its own pointer events stop while clicks pass through). */
  islandHover: "wanheda:island-hover",
  /** island window → main: a button (`IslandCommand`). */
  islandCommand: "wanheda:island-command",
  /** island window → main: the owner is dragging the island along its row (`IslandDrag`). */
  islandDrag: "wanheda:island-drag",
  /** page ⇄ main (invoke): the picked native folders (V72). */
  filesRoots: "wanheda:files-roots",
  /** page ⇄ main (invoke): pick a music or video folder in a dialog. */
  filesPick: "wanheda:files-pick",
  /** page ⇄ main (invoke): every music or video file in a picked folder. */
  filesList: "wanheda:files-list",
  /** page ⇄ main (invoke): forget a picked folder. */
  filesForget: "wanheda:files-forget",
  /** main → page: a picked folder changed on disk (settled), so its index can catch up. */
  filesChanged: "wanheda:files-changed",
  /** page ⇄ main (invoke): whether native Piper has this voice (V73). */
  ttsHas: "wanheda:tts-has",
  /** page ⇄ main (invoke): hand native Piper a voice the page already has (checked again against the catalog). */
  ttsInstall: "wanheda:tts-install",
  /** page ⇄ main (invoke): audio for phonemes (code points) in a kept voice. */
  ttsSynth: "wanheda:tts-synth",
  /** page ⇄ main (invoke): the voice was deleted; native Piper forgets it too. */
  ttsDrop: "wanheda:tts-drop",
  /** page ⇄ main (invoke): the audio codecs the bundled ffmpeg converts (V74), for the playback ladder. */
  mediaTranscodable: "wanheda:media-transcodable",
  /** page ⇄ main (invoke): a token to convert one picked file by (the preload reads its path from the File). */
  mediaGrant: "wanheda:media-grant",
  /** main window page → main: the title bar's colours, so Windows' buttons match the skin (`TitleBarColors`). */
  titleBarColors: "wanheda:title-bar-colors",
  /** main window page → main: open the app menu under the title bar's menu button (`MenuAnchor`). */
  titleBarMenu: "wanheda:title-bar-menu",
} as const;

/** The quick-capture page. */
export const CAPTURE_PATH = "/capture";

/**
 * Whether a helper window (quick capture, the island) must load its page
 * again: it's on anything but `path` on the app's origin (the sign-in page it
 * was sent to while signed out, an old origin, nothing yet).
 */
export function needsLoad(current: string, appOrigin: string, path: string): boolean {
  try {
    const url = new URL(current);
    return !(url.origin === appOrigin && url.pathname === path);
  } catch {
    return true;
  }
}

/**
 * Whether the main window's page can take a command now: an app page that
 * has loaded and said it listens. The sign-in page has no listener, so a
 * quick note sent there would be lost.
 */
export function canTakeCommand(page: { onApp: boolean; loading: boolean; ready: boolean }): boolean {
  return page.onApp && !page.loading && page.ready;
}

/** What main asks the page to do. */
export type Command =
  | { kind: "palette" }
  | { kind: "media"; action: MediaCommand }
  | { kind: "capture"; text: string }
  | { kind: "island"; command: Exclude<IslandCommand, { kind: "open" }> };

export const NOTICE_KINDS = ["timer", "money", "income"] as const;
export type DesktopNotice = { kind: (typeof NOTICE_KINDS)[number]; title: string; body: string; path: string | null };

export const MAX_NOTICE_TITLE = 120;
export const MAX_NOTICE_BODY = 300;

/** A notice if the whole payload is well formed, else null. A path main may not open becomes null. */
export function parseNotice(payload: unknown): DesktopNotice | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const { kind, title, body, path } = payload as Record<string, unknown>;
  if (typeof kind !== "string" || !(NOTICE_KINDS as readonly string[]).includes(kind)) return null;
  if (typeof title !== "string" || title.trim() === "" || title.length > MAX_NOTICE_TITLE) return null;
  if (typeof body !== "string" || body.length > MAX_NOTICE_BODY) return null;
  if (path !== null && typeof path !== "string") return null;
  // A path main may not open just isn't followed: the notice still shows, and a click brings the window back.
  const safe = path === null ? null : openPath(path);
  return { kind: kind as DesktopNotice["kind"], title: title.trim(), body: body.trim(), path: safe };
}

/** Longest quick-capture note taken. */
export const MAX_CAPTURE = 20_000;

/** Quick-capture text: non-blank, not too long. Kept as typed. */
export function parseCaptureText(payload: unknown): string | null {
  if (typeof payload !== "string" || payload.length > MAX_CAPTURE || payload.trim() === "") return null;
  return payload;
}

export function parseAudible(payload: unknown): boolean | null {
  return typeof payload === "boolean" ? payload : null;
}

export type SecretsAction = "import" | "demo";

export function parseSecretsAction(payload: unknown): SecretsAction | null {
  return payload === "import" || payload === "demo" ? payload : null;
}

export type DesktopChange = { keepRunning: boolean } | { island: boolean } | { shortcut: ShortcutId; accelerator: string | null };

/** One change from Settings → Desktop, or null. A shortcut is a valid accelerator, or null to turn it off. */
export function parseDesktopChange(payload: unknown): DesktopChange | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 1 && typeof record.keepRunning === "boolean") return { keepRunning: record.keepRunning };
  if (keys.length === 1 && typeof record.island === "boolean") return { island: record.island };
  if (keys.length !== 2 || !isShortcutId(record.shortcut) || !("accelerator" in record)) return null;
  if (record.accelerator === null) return { shortcut: record.shortcut, accelerator: null };
  const accelerator = parseAccelerator(record.accelerator);
  return accelerator ? { shortcut: record.shortcut, accelerator } : null;
}

export type ShortcutStatus = "on" | "taken" | "off";

/** What Settings → Desktop shows. Never a key's value: only how many there are. */
export type DesktopState = {
  keepRunning: boolean;
  /** The floating island while Wanheda is in the background (V70). */
  island: boolean;
  shortcuts: { id: ShortcutId; accelerator: string | null; status: ShortcutStatus }[];
  /** The imported `.env` keys: `desktop:dev` only. Null where the shell loads the hosted app (ADR-0016). */
  secrets: { mode: "own" | "demo"; names: number } | null;
};

/** A Settings → Desktop change's answer: `ok` false when another shortcut already uses those keys. */
export type DesktopSetResult = { ok: boolean; state: DesktopState };

export type SenderFrame = { origin: string; isTop: boolean };

/** Only the app's own top frame may use the bridge: not an embed, not another site. */
export function trustedSender(frame: SenderFrame | null | undefined, appOrigin: string | null): boolean {
  return Boolean(frame && appOrigin && frame.isTop && frame.origin === appOrigin);
}

/** The pages main may send the window to, and the query keys each takes. */
export const OPEN_PAGES: Readonly<Record<string, ReadonlySet<string>>> = {
  "/": new Set(),
  "/money": new Set(),
  "/money/analytics": new Set(),
  "/money/budgets": new Set(),
  "/money/import": new Set(),
  "/money/rules": new Set(),
  "/money/subscriptions": new Set(),
  "/income": new Set(),
  "/income/goals": new Set(),
  "/income/net": new Set(),
  "/notes": new Set(["n", "view"]),
  "/reader": new Set(),
  "/media": new Set(["tab", "m", "sort"]),
  "/settings": new Set(["s"]),
};

/** Longest query value taken. Ids and tab names are short. */
export const MAX_VALUE = 200;

const BASE = "http://wanheda.invalid";

/**
 * `path` as a same-app path main may send the page to, or null. Only the
 * pages and query keys above get through, each key once.
 */
export function openPath(path: string): string | null {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return null;
  let url: URL;
  try {
    url = new URL(path, BASE);
  } catch {
    return null;
  }
  // No "..", "%2e", tabs or other spellings the URL parser would tidy into an allowed page.
  if (url.origin !== BASE || url.hash || path.split("?")[0] !== url.pathname) return null;
  const allowed = OPEN_PAGES[url.pathname];
  if (!allowed) return null;
  const entries = [...url.searchParams.entries()];
  const keys = entries.map(([key]) => key);
  if (keys.some((key) => !allowed.has(key)) || new Set(keys).size !== keys.length) return null;
  if (entries.some(([, value]) => value.length > MAX_VALUE)) return null;
  return `${url.pathname}${url.search}`;
}

export function parseRootKind(payload: unknown): "music" | "video" | null {
  return payload === "music" || payload === "video" ? payload : null;
}

/** Largest voice config taken (a real one is about 5 KB). */
export const MAX_VOICE_CONFIG = 64 * 1024;

/** A voice handed over by the page: its id, model bytes and config text. Checked against the catalog in tts.ts. */
export function parseTtsInstall(payload: unknown): { voice: string; model: Uint8Array; config: string } | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const { voice, model, config } = payload as Record<string, unknown>;
  if (typeof voice !== "string" || typeof config !== "string" || config.length > MAX_VOICE_CONFIG) return null;
  const bytes = model instanceof Uint8Array ? model : model instanceof ArrayBuffer ? new Uint8Array(model) : null;
  return bytes ? { voice, model: bytes, config } : null;
}

/** The title bar's background and the colour of Windows' buttons on it, as `#rrggbb`. */
export type TitleBarColors = { color: string; symbol: string };

const HEX = /^#[0-9a-f]{6}$/i;

export function parseTitleBarColors(payload: unknown): TitleBarColors | null {
  if (!payload || typeof payload !== "object") return null;
  const { color, symbol } = payload as Record<string, unknown>;
  if (typeof color !== "string" || typeof symbol !== "string" || !HEX.test(color) || !HEX.test(symbol)) return null;
  return { color: color.toLowerCase(), symbol: symbol.toLowerCase() };
}

/** Where the app menu opens: the menu button's bottom-left corner, in the window's CSS pixels. */
export type MenuAnchor = { x: number; y: number };

const MAX_ANCHOR = 16_384;

export function parseMenuAnchor(payload: unknown): MenuAnchor | null {
  if (!payload || typeof payload !== "object") return null;
  const { x, y } = payload as Record<string, unknown>;
  const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= MAX_ANCHOR;
  if (!ok(x) || !ok(y)) return null;
  return { x: Math.round(x), y: Math.round(y) };
}
