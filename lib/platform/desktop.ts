// The desktop shell's bridge as the page sees it (SPEC V67). The preload
// (desktop/preload.ts) exposes `window.wanheda` in the desktop window's own
// page only; on the web, in an embed or in a child window it is undefined, so
// every caller falls back to the web path and the web never changes behaviour.

export type WanhedaDesktop = {
  readonly desktop: true;
  /** Paths in this app the shell wants shown (a `wanheda://` link was opened). Returns an unsubscribe. */
  onOpen(callback: (path: string) => void): () => void;
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
