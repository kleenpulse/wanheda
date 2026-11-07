// The phone tab bar's overflow rule (FR-SHELL-9), pure so it can be tested:
// as many routes as fit stay on the bar, the rest go into a "More" menu. The
// controls pinned after the routes (search, account) never move, and the
// page you're on always keeps its place on the bar.

/** One tab's room: the 44 px touch circle plus 4 px so neighbours never touch. */
export const TAB_SLOT_PX = 48;

/** How many tabs fit in a bar `widthPx` wide (inside its padding). */
export function tabCapacity(widthPx: number, slot = TAB_SLOT_PX): number {
  return Math.max(0, Math.floor(widthPx / slot));
}

/**
 * Splits the routes between the bar and the More menu. `capacity`: tabs that
 * fit; `pinned`: controls always on the bar beside the routes; `active`: the
 * current route's index, or -1. When everything fits there is no More. When
 * not, More takes a slot, at least one route stays, and an active route that
 * would overflow takes the bar's last route place instead.
 */
export function splitTabs<T>(routes: readonly T[], capacity: number, pinned: number, active: number): { bar: T[]; more: T[] } {
  if (routes.length + pinned <= capacity) return { bar: [...routes], more: [] };
  const room = Math.max(1, capacity - pinned - 1);
  const keep = routes.slice(0, room);
  if (active >= room && active < routes.length) {
    const current = routes[active] as T;
    keep[room - 1] = current;
  }
  const onBar = new Set(keep);
  return { bar: keep, more: routes.filter((r) => !onBar.has(r)) };
}
