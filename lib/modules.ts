import { House, Settings, type LucideIcon } from "lucide-react";
import type { Route } from "next";

// The module registry (FRD 4.2). The shell builds the rail and the tab bar
// from it, and later the dock, the palette and the widget picker, so a new
// module adds a manifest here and never edits shell code.
//
// v1 carries only what the rail needs. `widgets`, `commands`, `activities`
// and `capability` arrive with the checkpoints that use them (SPEC T23-T27).

export interface ModuleManifest {
  /** Stable id, also the route segment for real modules: "money". */
  id: string;
  title: string;
  icon: LucideIcon;
  route: Route;
  /** One short line for the palette and tooltips. No counts: they go stale. */
  blurb: string;
}

/** The apps, in rail order. Phase 1 has no app modules yet, only Home. */
export const MODULES: readonly ModuleManifest[] = [
  { id: "home", title: "Home", icon: House, route: "/", blurb: "Your board" },
];

/** Shell pages that are not apps. They sit at the foot of the rail. */
export const SYSTEM_PAGES: readonly ModuleManifest[] = [
  { id: "settings", title: "Settings", icon: Settings, route: "/settings", blurb: "Theme, passkeys and account" },
];

/**
 * Segment-aware, not prefix-aware: a bare startsWith would light up /money
 * for /moneyx. Match the route exactly, or as a whole leading segment.
 */
export function isActive(pathname: string, route: string): boolean {
  if (route === "/") return pathname === "/";
  return pathname === route || pathname.startsWith(`${route}/`);
}
