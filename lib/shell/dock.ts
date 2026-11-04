import type { LucideIcon } from "lucide-react";
import type { Route } from "next";
import { isWindowId, type ActivityKind, type ModuleManifest, type ToolManifest, type WindowId } from "@/lib/modules";

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
}

function isRunning(m: ToolManifest, state: DockState): boolean {
  return (
    (m.activities ?? []).some((k) => state.live.has(k)) ||
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
