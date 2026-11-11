import type { LucideIcon } from "lucide-react";
import type { Route } from "next";
import { isActive, isWindowId, type ActivityKind, type ModuleManifest, type ToolManifest, type WindowId } from "@/lib/modules";

// The dock's rules (FR-SHELL-4), pure so they can be tested. An entry shows
// when it is pinned or running; running means one of its activity kinds is
// live on the bus or one of its mini windows is open.

export type DockTarget = { kind: "route"; route: Route } | { kind: "window"; window: WindowId };

export interface DockEntry {
  id: string;
  title: string;
  icon: LucideIcon;
  target: DockTarget;
  running: boolean;
}

export interface DockState {
  live: ReadonlySet<ActivityKind>;
  open: ReadonlySet<WindowId>;
  /**
   * The one entry a live activity belongs to, by id, when it is known: a note read aloud is Notes
   * running, not the Reader. A kind without an owner falls back to every entry that declares it.
   */
  owner?: ReadonlyMap<ActivityKind, string>;
}

/** The app an in-app link opens: the one whose route leads its path. Null for no link, or one outside every app. */
export function appForHref(apps: readonly ModuleManifest[], href: string | undefined): string | null {
  const path = href?.split(/[?#]/)[0];
  if (!path) return null;
  return apps.find((m) => isActive(path, m.route))?.id ?? null;
}

function isRunning(m: ToolManifest, state: DockState): boolean {
  const live = (k: ActivityKind) => state.live.has(k);
  const owned = [...(state.owner ?? [])].some(([k, id]) => id === m.id && live(k));
  return (
    owned ||
    (m.activities ?? []).some((k) => live(k) && !state.owner?.has(k)) ||
    (m.windows ?? []).some((w) => isWindowId(w.id) && state.open.has(w.id))
  );
}

/** Apps open their route; tools open their first mini window. A tool without one has no dock entry. */
export function dockEntries(
  apps: readonly ModuleManifest[],
  tools: readonly ToolManifest[],
  state: DockState,
): { apps: DockEntry[]; tools: DockEntry[] } {
  const entry = (m: ToolManifest, target: DockTarget): DockEntry | null => {
    const running = isRunning(m, state);
    return m.pinned || running ? { id: m.id, title: m.title, icon: m.icon, target, running } : null;
  };

  return {
    apps: apps.flatMap((m) => entry(m, { kind: "route", route: m.route }) ?? []),
    tools: tools.flatMap((t) => {
      const win = t.windows?.find((w) => isWindowId(w.id))?.id;
      if (win === undefined || !isWindowId(win)) return [];
      return entry(t, { kind: "window", window: win }) ?? [];
    }),
  };
}
