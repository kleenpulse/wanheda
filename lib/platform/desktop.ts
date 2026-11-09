// The desktop shell's bridge as the page sees it (SPEC V67). The preload
// (desktop/preload.ts) exposes `window.wanheda` in the desktop window's own
// page only; on the web, in an embed or in a child window it is undefined, so
// every caller falls back to the web path and the web never changes behaviour.

import type { IslandCommand, IslandSnapshot } from "@/lib/island/snapshot";

// Mirrors desktop/bridge.ts, desktop/island.ts and desktop/shortcuts.ts (the shell checks every
// payload there; these are the shapes the page sends and gets).

export type DesktopShortcutId = "capture" | "palette";
export type DesktopMediaCommand = "play-pause" | "next" | "previous" | "stop";

/** What the shell asks the page to do. */
export type DesktopCommand =
  | { kind: "palette" }
  | { kind: "media"; action: DesktopMediaCommand }
  | { kind: "capture"; text: string }
  | { kind: "island"; command: Exclude<IslandCommand, { kind: "open" }> };

/** A system notification. `path` must be a page the shell may open, or null. */
export type DesktopNotice = { kind: "timer" | "money" | "income"; title: string; body: string; path: string | null };

export type DesktopShortcutStatus = "on" | "taken" | "off";

export type DesktopState = {
  keepRunning: boolean;
  island: boolean;
  shortcuts: { id: DesktopShortcutId; accelerator: string | null; status: DesktopShortcutStatus }[];
  secrets: { mode: "own" | "demo"; names: number };
};

export type DesktopRootKind = "music" | "video";
export type DesktopRoot = { id: string; kind: DesktopRootKind; path: string; name: string };
export type DesktopListedFile = { path: string; size: number; mtimeMs: number };

export type DesktopChange = { keepRunning: boolean } | { island: boolean } | { shortcut: DesktopShortcutId; accelerator: string | null };

export type WanhedaDesktop = {
  readonly desktop: true;
  /** Paths in this app the shell wants shown (a `wanheda://` link was opened). Returns an unsubscribe. */
  onOpen(callback: (path: string) => void): () => void;
  /** Global shortcuts and the capture window, through the shell. Returns an unsubscribe. */
  onCommand(callback: (command: DesktopCommand) => void): () => void;
  /** Shown only while the window is out of sight or unfocused. */
  notify(notice: DesktopNotice): void;
  /** Whether something can play (an audible owner, V60): the shell holds the media keys while it can. */
  setMediaActive(active: boolean): void;
  /** The shell's listener is up (true) or gone (false): until then, quick capture says Wanheda isn't ready. */
  setCommandsReady(ready: boolean): void;
  settings: {
    get(): Promise<DesktopState>;
    /** `ok` is false when another shortcut already uses those keys. */
    set(change: DesktopChange): Promise<{ ok: boolean; state: DesktopState }>;
    secrets(action: "import" | "demo"): Promise<DesktopState>;
    onChange(callback: (state: DesktopState) => void): () => void;
  };
  /** The floating island (V70). The main window publishes and hears whether it floats; the island window does the rest. */
  island: {
    publish(snapshot: IslandSnapshot): void;
    onFloating(callback: (floating: boolean) => void): () => void;
    get(): Promise<IslandSnapshot | null>;
    onSnapshot(callback: (snapshot: IslandSnapshot) => void): () => void;
    onHover(callback: (over: boolean) => void): () => void;
    report(report: { content: boolean; rect: { x: number; y: number; width: number; height: number } | null }): void;
    command(command: IslandCommand): void;
  };
  /** Native music and video folders (V72): picked in the shell's dialog, read through `wanheda-file:` URLs. */
  files: {
    roots(): Promise<DesktopRoot[]>;
    /** Null when the dialog was closed. */
    pick(kind: DesktopRootKind): Promise<DesktopRoot | null>;
    /** `complete` is false when a folder couldn't be read (or the drive is gone): nothing should be pruned then. */
    list(rootId: string): Promise<{ files: DesktopListedFile[]; complete: boolean }>;
    forget(rootId: string): Promise<void>;
    onChanged(callback: (rootId: string) => void): () => void;
  };
  /** Quick capture's own window only; elsewhere the shell ignores it. */
  capture: {
    /** True once the main window's page has it to save; false while it can't take it (signed out, loading). */
    save(text: string): Promise<boolean>;
    close(): void;
  };
};

declare global {
  interface Window {
    wanheda?: WanhedaDesktop;
  }
}

/** The bridge, or null on the web (and during server rendering). */
export function desktopBridge(): WanhedaDesktop | null {
  if (typeof window === "undefined") return null;
  const bridge = window.wanheda;
  return bridge?.desktop === true ? bridge : null;
}

export function isDesktop(): boolean {
  return desktopBridge() !== null;
}

const BASE = "http://wanheda.invalid";

/** Same-app paths only: the shell already checked it, this is a second lock. */
export function isAppPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return false;
  try {
    // The URL parser drops tabs and newlines, so "/\t/evil.test" would leave the app.
    return new URL(path, BASE).origin === BASE;
  } catch {
    return false;
  }
}

/** The shell's limits on a notice (desktop/bridge.ts): longer text would drop the whole notice. */
const NOTICE_TITLE_MAX = 120;
const NOTICE_BODY_MAX = 300;

function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/** A notification-centre row as a system notification. A path that isn't a same-app path is left out. */
export function desktopNotice(n: { kind: DesktopNotice["kind"]; title: string; body: string | null; href: string | null }): DesktopNotice | null {
  const title = clip(n.title, NOTICE_TITLE_MAX);
  if (title === "") return null;
  return { kind: n.kind, title, body: clip(n.body ?? "", NOTICE_BODY_MAX), path: n.href !== null && isAppPath(n.href) ? n.href : null };
}

const CODE_KEYS: Readonly<Record<string, string>> = {
  Space: "Space",
  Tab: "Tab",
  Enter: "Enter",
  Backspace: "Backspace",
  Delete: "Delete",
  Insert: "Insert",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Minus: "-",
  Equal: "=",
  Backquote: "`",
};

/**
 * A pressed key combination as a shell accelerator ("Ctrl+Shift+Space"), or
 * null while it isn't one yet (only modifiers held) or never can be (no Ctrl,
 * Alt or Win). Read from the physical key, so the layout doesn't matter.
 */
export function acceleratorFromKey(e: { code: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }): string | null {
  let key: string | undefined;
  const letter = /^Key([A-Z])$/.exec(e.code);
  const digit = /^Digit(\d)$/.exec(e.code);
  const fn = /^F(\d{1,2})$/.exec(e.code);
  if (letter) key = letter[1];
  else if (digit) key = digit[1];
  else if (fn && Number(fn[1]) >= 1 && Number(fn[1]) <= 24) key = e.code;
  else key = CODE_KEYS[e.code];
  if (!key || !(e.ctrlKey || e.altKey || e.metaKey)) return null;
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Super"].filter((m): m is string => Boolean(m));
  return [...mods, key].join("+");
}

/** An accelerator's keys as Windows names them, for <Kbd>. */
export function acceleratorKeys(accelerator: string): string[] {
  return accelerator.split("+").map((k) => (k === "Super" ? "Win" : k === "Plus" ? "+" : k));
}

const MEDIA_COMMANDS: readonly string[] = ["play-pause", "next", "previous", "stop"];

/** A second lock on what the shell sends (it builds every command itself). */
export function isDesktopCommand(value: unknown): value is DesktopCommand {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  if (c.kind === "palette") return true;
  if (c.kind === "media") return typeof c.action === "string" && MEDIA_COMMANDS.includes(c.action);
  if (c.kind === "island") return isIslandPageCommand(c.command);
  return c.kind === "capture" && typeof c.text === "string" && c.text.trim() !== "";
}

function isIslandPageCommand(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  if (c.kind === "music") return c.action === "toggle" || c.action === "next" || c.action === "previous";
  if (c.kind === "speech") return c.action === "toggle" || c.action === "stop";
  return c.kind === "dismiss" && typeof c.noticeId === "string" && c.noticeId !== "";
}

/** A native folder file's URL (desktop/files.ts `fileUrl`): each path segment encoded. */
export function desktopFileUrl(rootId: string, relPath: string): string {
  return `wanheda-file://${rootId}/${relPath.split("/").map(encodeURIComponent).join("/")}`;
}

/** The desktop app's files bridge, or null on the web. */
export function desktopFiles(): WanhedaDesktop["files"] | null {
  return desktopBridge()?.files ?? null;
}
