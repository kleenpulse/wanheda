// The video player's keys (T72, V65): one pure map from a key press to an
// action, so the rules are tested here and the chrome only carries them out.
// Matched on `e.key` (what the key types on this layout), never `e.code`.

export type PlayerAction =
  | { type: "toggle" }
  | { type: "seek"; by: number }
  | { type: "volume"; by: number }
  | { type: "mute" }
  | { type: "fullscreen" }
  | { type: "pip" }
  | { type: "captions" }
  | { type: "theatre" }
  | { type: "next" }
  | { type: "prev" }
  | { type: "speed"; dir: 1 | -1 }
  | { type: "jump"; fraction: number }
  | { type: "frame"; dir: 1 | -1 }
  | { type: "help" };

export type KeyPress = { key: string; ctrlKey: boolean; altKey: boolean; metaKey: boolean; shiftKey: boolean };

/**
 * Where the key was pressed:
 * - `player`: the player itself (its frame, the picture, or the page body while it's the one playing)
 * - `button`: a button (or link) inside the player: it keeps Space and Enter (its press), nothing else
 * - `widget`: a control with keys of its own (a slider, the up-next rail): it keeps Space, Enter and the arrows
 * - `text`: a field the owner is typing in
 * - `outside`: anywhere else on the page
 */
export type KeyTarget = "player" | "button" | "widget" | "text" | "outside";

/** Keys a focused button keeps (its press), and the ones a slider or list keeps too (its moves). */
const BUTTON_KEYS = new Set([" ", "Enter"]);
const WIDGET_KEYS = new Set([" ", "Enter", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);

export const SEEK_SHORT_S = 5;
export const SEEK_LONG_S = 10;
export const VOLUME_KEY_STEP = 0.05;
/** One frame when the probe didn't give a rate. */
export const DEFAULT_FPS = 30;

export function keyAction(e: KeyPress, target: KeyTarget, paused: boolean): PlayerAction | null {
  // Shift is allowed: it's part of `<`, `>`, `?`, `N` and `P` on most layouts.
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  if (target === "outside" || target === "text") return null;
  if (target === "button" && BUTTON_KEYS.has(e.key)) return null;
  if (target === "widget" && WIDGET_KEYS.has(e.key)) return null;
  switch (e.key) {
    case " ":
    case "k":
    case "K":
      return { type: "toggle" };
    case "j":
    case "J":
      return { type: "seek", by: -SEEK_LONG_S };
    case "l":
    case "L":
      return { type: "seek", by: SEEK_LONG_S };
    case "ArrowLeft":
      return { type: "seek", by: -SEEK_SHORT_S };
    case "ArrowRight":
      return { type: "seek", by: SEEK_SHORT_S };
    case "ArrowUp":
      return { type: "volume", by: VOLUME_KEY_STEP };
    case "ArrowDown":
      return { type: "volume", by: -VOLUME_KEY_STEP };
    case "m":
    case "M":
      return { type: "mute" };
    case "f":
    case "F":
      return { type: "fullscreen" };
    case "i":
    case "I":
      return { type: "pip" };
    case "c":
    case "C":
      return { type: "captions" };
    case "t":
    case "T":
      return { type: "theatre" };
    // Next and previous need Shift, as on YouTube: a bare n|p stays free.
    case "N":
      return e.shiftKey ? { type: "next" } : null;
    case "P":
      return e.shiftKey ? { type: "prev" } : null;
    case "<":
      return { type: "speed", dir: -1 };
    case ">":
      return { type: "speed", dir: 1 };
    case ",":
      return paused ? { type: "frame", dir: -1 } : null;
    case ".":
      return paused ? { type: "frame", dir: 1 } : null;
    case "?":
      return { type: "help" };
    default:
      // `/` is the palette's, and every other key goes on to the page.
      if (/^[0-9]$/.test(e.key)) return { type: "jump", fraction: Number(e.key) / 10 };
      return null;
  }
}

/** One frame's length at `fps` (the probe's rate; 30 when unknown or nonsense). */
export function frameStep(fps: number | null | undefined): number {
  return 1 / (fps && Number.isFinite(fps) && fps > 0 && fps <= 240 ? fps : DEFAULT_FPS);
}

/** The shortcuts sheet: what to press, what it does. */
export const SHORTCUTS: readonly { keys: readonly string[]; does: string }[] = [
  { keys: ["Space", "K"], does: "Play or pause" },
  { keys: ["J", "L"], does: "Back or forward 10 seconds" },
  { keys: ["←", "→"], does: "Back or forward 5 seconds" },
  { keys: ["↑", "↓"], does: "Volume up or down" },
  { keys: ["M"], does: "Mute" },
  { keys: ["F"], does: "Full screen" },
  { keys: ["I"], does: "Picture in picture" },
  { keys: ["C"], does: "Subtitles on or off" },
  { keys: ["T"], does: "Theatre" },
  { keys: ["Shift N", "Shift P"], does: "Next or previous video" },
  { keys: ["<", ">"], does: "Slower or faster" },
  { keys: ["0–9"], does: "Jump to 0–90%" },
  { keys: [",", "."], does: "Frame back or forward (paused)" },
  { keys: ["?"], does: "These shortcuts" },
];
