import { CloudSun, Clock, House, NotebookPen, Settings, Sunrise, type LucideIcon } from "lucide-react";
import type { Route } from "next";

// The module registry (FRD 4.2). The shell builds the rail, the tab bar and
// the board's widget picker from it, and later the dock and the palette, so a
// new module adds a manifest here and never edits shell code.
//
// `commands`, `activities` and `capability` arrive with the checkpoints that
// use them (SPEC T26-T27).

/** Size limits in grid cells, on the 12-column board. Narrower boards clamp them. */
export interface WidgetSize {
  w: number;
  h: number;
  minW: number;
  minH: number;
  maxW?: number;
  maxH?: number;
}

/** A home-board widget a module offers. The renderer lives in components/widgets. */
export interface WidgetDef {
  /** Globally unique, `<module>.<widget>`. Stored in saved layouts, so never rename one. */
  id: string;
  title: string;
  /** One line for the widget picker. */
  blurb: string;
  icon: LucideIcon;
  size: WidgetSize;
}

export interface ModuleManifest {
  /** Stable id, also the route segment for real modules: "money". */
  id: string;
  title: string;
  icon: LucideIcon;
  route: Route;
  /** One short line for the palette and tooltips. No counts: they go stale. */
  blurb: string;
  widgets?: readonly WidgetDef[];
}

const HOME = {
  id: "home",
  title: "Home",
  icon: House,
  route: "/",
  blurb: "Your board",
  // Placeholders until their modules land: the note becomes the Notes app's
  // pinned notes, and "today" grows spend and renewals with Money.
  widgets: [
    {
      id: "home.clock",
      title: "Clock",
      blurb: "The time and the date",
      icon: Clock,
      size: { w: 4, h: 2, minW: 2, minH: 2, maxH: 4 },
    },
    {
      id: "home.weather",
      title: "Weather",
      blurb: "Now, and today's high and low",
      icon: CloudSun,
      size: { w: 4, h: 2, minW: 2, minH: 2, maxH: 4 },
    },
    {
      id: "home.today",
      title: "Today",
      blurb: "What's running and what's next",
      icon: Sunrise,
      size: { w: 4, h: 4, minW: 3, minH: 3 },
    },
    {
      id: "home.note",
      title: "Quick note",
      blurb: "A scratchpad on this device",
      icon: NotebookPen,
      size: { w: 8, h: 2, minW: 3, minH: 2 },
    },
  ],
} as const satisfies ModuleManifest;

/** The apps, in rail order. Phase 1 has no app modules yet, only Home. */
export const MODULES = [HOME] as const satisfies readonly ModuleManifest[];

/** Shell pages that are not apps. They sit at the foot of the rail. */
export const SYSTEM_PAGES: readonly ModuleManifest[] = [
  { id: "settings", title: "Settings", icon: Settings, route: "/settings", blurb: "Theme, passkeys and account" },
];

/** Every widget id the registry offers. Renderers are keyed by it, so a missing one fails typecheck. */
export type WidgetId = (typeof MODULES)[number]["widgets"][number]["id"];

/** Every widget on offer, in picker order. */
export const WIDGETS: readonly (WidgetDef & { id: WidgetId })[] = MODULES.flatMap((m) => m.widgets);

const WIDGET_IDS: ReadonlySet<string> = new Set(WIDGETS.map((w) => w.id));

export function isWidgetId(id: string): id is WidgetId {
  return WIDGET_IDS.has(id);
}

/**
 * Segment-aware, not prefix-aware: a bare startsWith would light up /money
 * for /moneyx. Match the route exactly, or as a whole leading segment.
 */
export function isActive(pathname: string, route: string): boolean {
  if (route === "/") return pathname === "/";
  return pathname === route || pathname.startsWith(`${route}/`);
}
