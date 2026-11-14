import type { UpdateState } from "./bridge";

/*
 * What the updater's events mean for the page's pill, the tray and the
 * notices. Pure, so the rules are tested without electron-updater.
 */

export const NO_UPDATE: UpdateState = { kind: "none" };

export type UpdateEvent =
  /** A check found `version`; `downloading` says whether electron-updater started on it by itself (automatic downloads on). */
  | { type: "available"; version: string; downloading: boolean }
  /** The owner chose "Download update". */
  | { type: "download" }
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
      // A re-check of the ready version keeps it ready.
      if (state.kind === "ready" && state.version === event.version) return state;
      if (!event.downloading) {
        // Nothing new starts: a ready installer stays in the cache, and a download already under way goes on.
        if (state.kind === "ready" || state.kind === "downloading") return state;
        return state.kind === "available" && state.version === event.version ? state : { kind: "available", version: event.version };
      }
      // A newer version replaces a ready one: electron-updater deletes the ready installer when the newer download starts.
      return state.kind === "downloading" && state.version === event.version ? state : { kind: "downloading", version: event.version, percent: 0 };
    case "download":
      return state.kind === "available" ? { kind: "downloading", version: state.version, percent: 0 } : state;
    case "progress": {
      // A failed re-check during a download shows "available" while the download goes on: its progress brings the ring back.
      if (state.kind !== "downloading" && state.kind !== "available") return state;
      const percent = Math.min(100, Math.max(0, Math.floor(Number.isFinite(event.percent) ? event.percent : 0)));
      return state.kind === "downloading" && percent === state.percent ? state : { kind: "downloading", version: state.version, percent };
    }
    case "downloaded":
      return state.kind === "ready" && state.version === event.version ? state : { kind: "ready", version: event.version };
    case "error":
      // A failed download offers the version again (electron-updater keeps what it found); a ready update stays.
      return state.kind === "downloading" ? { kind: "available", version: state.version } : state;
  }
}

/**
 * Whether a found version downloads now: automatic downloads are on, or it's the version the owner
 * already downloaded before a quit (its cached installer answers at once; a wiped cache fetches the
 * version they chose again).
 */
export function downloadsNow(version: string, autoDownload: boolean, downloaded: string | null): boolean {
  return autoDownload || version === downloaded;
}

/**
 * A system notification for a change, for when the window can't show the pill. Null when there's
 * nothing to say: an offered version is announced once, not again after each failed download.
 */
export function updateNotice(state: UpdateState, previous: UpdateState): { title: string; body: string } | null {
  if (state.kind === "ready") return { title: `Wanheda ${state.version} is ready.`, body: "Click to restart and update." };
  if (state.kind !== "available" || ("version" in previous && previous.version === state.version)) return null;
  return { title: `Wanheda ${state.version} is available.`, body: "Click to download it." };
}

/** The tray's update item for this state, or null. */
export function updateMenuLabel(state: UpdateState): string | null {
  if (state.kind === "ready") return `Restart to update to ${state.version}`;
  return state.kind === "available" ? `Download Wanheda ${state.version}` : null;
}

export const CHECK_FOR_UPDATES_LABEL = "Check for updates…";
