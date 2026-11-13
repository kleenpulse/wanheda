import type { UpdateState } from "./bridge";

/*
 * What the updater's events mean for the page's pill, the tray and the
 * notices. Pure, so the rules are tested without electron-updater.
 */

export const NO_UPDATE: UpdateState = { kind: "none" };

export type UpdateEvent =
  | { type: "available"; version: string }
  | { type: "progress"; percent: number }
  | { type: "downloaded"; version: string }
  | { type: "error" };

/**
 * The next state, or the same object when nothing the page shows changed
 * (progress only moves in whole percents), so main can skip sending it.
 */
export function nextUpdateState(state: UpdateState, event: UpdateEvent): UpdateState {
  switch (event.type) {
    case "available":
      // A re-check of the ready version keeps it ready. A newer version replaces it: electron-updater
      // deletes the ready installer when the newer download starts, so restarting would install nothing.
      if (state.kind === "ready" && state.version === event.version) return state;
      return state.kind === "downloading" && state.version === event.version ? state : { kind: "downloading", version: event.version, percent: 0 };
    case "progress": {
      if (state.kind !== "downloading") return state;
      const percent = Math.min(100, Math.max(0, Math.floor(Number.isFinite(event.percent) ? event.percent : 0)));
      return percent === state.percent ? state : { ...state, percent };
    }
    case "downloaded":
      return state.kind === "ready" && state.version === event.version ? state : { kind: "ready", version: event.version };
    case "error":
      // A failed download hides the pill; the next check starts it again. A ready update stays.
      return state.kind === "downloading" ? NO_UPDATE : state;
  }
}

/** A system notification for this state, for when the window can't show the pill. Null when there's nothing to say. */
export function updateNotice(state: UpdateState): { title: string; body: string } | null {
  return state.kind === "ready" ? { title: `Wanheda ${state.version} is ready.`, body: "Click to restart and update." } : null;
}

/** The tray's update item for this state, or null. */
export function updateMenuLabel(state: UpdateState): string | null {
  return state.kind === "ready" ? `Restart to update to ${state.version}` : null;
}

export const CHECK_FOR_UPDATES_LABEL = "Check for updates…";
