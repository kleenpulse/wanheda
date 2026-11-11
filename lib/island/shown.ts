// Whether the island shows at all on this device (owner 2026-11-11): the
// in-app island and, in the desktop app, the floating one with it. Kept on
// the device (localStorage), like privacy mode: it is about this screen.
// Timers, music and read-aloud go on without it, and alerts still reach the
// notification centre.

export const ISLAND_SHOWN_KEY = "wanheda-island";

/** On, unless this device turned it off: a missing or unknown value shows the island. */
export function parseIslandShown(value: string | null | undefined): boolean {
  return value !== "0";
}

export function encodeIslandShown(shown: boolean): string {
  return shown ? "1" : "0";
}
