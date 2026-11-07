import { AudioLines, BookOpen, BookOpenText, CalendarClock, ChartColumnStacked, Clapperboard, CloudSun, Clock, DollarSign, House, Music, NotebookPen, Pin, Settings, Sunrise, Target, Timer, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import type { Route } from "next";

// The module registry (FRD 4.2). The shell builds the rail, the tab bar, the
// dock, the board's widget picker and the palette's window commands from it,
// so a new module adds a manifest here and never edits shell code.
//
// `commands` and `capability` arrive with the checkpoints that use them.

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

/** Activity kinds on the bus (FRD 4.3). Phase 1 publishes timers only. */
export type ActivityKind = "media" | "speech" | "timer" | "transfer" | "sync" | "money-alert" | "saas-alert" | "agent" | "pomodoro";

/** Size of a mini window in px. The layer clamps it to the screen. */
export interface WindowSize {
  w: number;
  h: number;
  minW: number;
  minH: number;
}

/** A mini window a module offers (FR-SHELL-5). The renderer lives in components/windows. */
export interface WindowDef {
  /** Globally unique, `<module>.<window>`. Stored with its position, so never rename one. */
  id: string;
  title: string;
  icon: LucideIcon;
  size: WindowSize;
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
  windows?: readonly WindowDef[];
  /** Activity kinds this module publishes. Any of them live makes it "running" in the dock. */
  activities?: readonly ActivityKind[];
  /** In the dock even when not running. Prefs make this the owner's choice later (T27). */
  pinned?: boolean;
}

/** A shell tool: lives in the dock and the palette, opens a mini window, has no route. */
export type ToolManifest = Omit<ModuleManifest, "route" | "widgets">;

const HOME = {
  id: "home",
  title: "Home",
  icon: House,
  route: "/",
  blurb: "Your board",
  pinned: true,
  windows: [],
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
      // The id predates the Notes app and is stored in layouts, so it stays.
      id: "home.note",
      title: "Pinned notes",
      blurb: "Your pinned notes, and a quick new one",
      icon: Pin,
      size: { w: 8, h: 2, minW: 3, minH: 2 },
    },
  ],
} as const satisfies ModuleManifest;

const NOTES = {
  id: "notes",
  title: "Notes",
  icon: NotebookPen,
  route: "/notes",
  blurb: "Sticky notes and quick capture",
  widgets: [],
  windows: [{ id: "notes.note", title: "Note", icon: NotebookPen, size: { w: 340, h: 440, minW: 280, minH: 280 } }],
} as const satisfies ModuleManifest;

const MONEY = {
  id: "money",
  title: "Money",
  icon: DollarSign,
  route: "/money",
  blurb: "Spending, income and subscriptions",
  widgets: [
    {
      id: "money.today",
      title: "Spent today",
      blurb: "Today's spend and the month so far, with a quick add",
      icon: Wallet,
      size: { w: 4, h: 2, minW: 3, minH: 2, maxH: 3 },
    },
    {
      id: "money.budget",
      title: "Budgets",
      blurb: "This month's budgets and how much is used",
      icon: Target,
      size: { w: 4, h: 4, minW: 3, minH: 2 },
    },
    {
      // The id predates the billing-cycle card and is stored in layouts, so it stays.
      id: "money.renewals",
      title: "Billing cycle",
      blurb: "Where a subscription is in its cycle; pin the one to show",
      icon: CalendarClock,
      size: { w: 4, h: 4, minW: 3, minH: 2 },
    },
  ],
  windows: [],
  activities: ["money-alert"],
} as const satisfies ModuleManifest;

const INCOME = {
  id: "income",
  title: "Income",
  icon: TrendingUp,
  route: "/income",
  blurb: "MRR, customers and revenue from your products",
  widgets: [
    {
      id: "income.mrr",
      title: "MRR",
      blurb: "Monthly recurring revenue now, and its last 30 days",
      icon: TrendingUp,
      size: { w: 4, h: 2, minW: 3, minH: 2, maxH: 4 },
    },
    {
      id: "income.net-new",
      title: "Net new MRR",
      blurb: "This month's MRR movements: new, expansion, churn",
      icon: ChartColumnStacked,
      size: { w: 4, h: 3, minW: 3, minH: 2, maxH: 4 },
    },
  ],
  windows: [],
  activities: ["saas-alert"],
} as const satisfies ModuleManifest;

const READER = {
  id: "reader",
  title: "Reader",
  icon: BookOpen,
  route: "/reader",
  blurb: "Your library: PDFs, Markdown and text",
  widgets: [
    {
      id: "reader.continue",
      title: "Continue reading",
      blurb: "Pick up where you stopped, on any device",
      icon: BookOpenText,
      size: { w: 4, h: 3, minW: 3, minH: 2, maxH: 5 },
    },
  ],
  windows: [{ id: "reader.speech", title: "Read aloud", icon: AudioLines, size: { w: 340, h: 360, minW: 280, minH: 280 } }],
  activities: ["speech"],
} as const satisfies ModuleManifest;

const MEDIA = {
  id: "media",
  title: "Media",
  icon: Clapperboard,
  route: "/media",
  blurb: "Videos, music, links and embeds, played on this device",
  widgets: [
    {
      id: "media.now-playing",
      title: "Now playing",
      blurb: "The song playing, with play, pause and skip",
      icon: Music,
      size: { w: 4, h: 3, minW: 3, minH: 3, maxH: 4 },
    },
  ],
  windows: [{ id: "media.player", title: "Music player", icon: Music, size: { w: 340, h: 460, minW: 280, minH: 300 } }],
  activities: ["transfer", "media"],
} as const satisfies ModuleManifest;

/** The apps, in rail order. */
export const MODULES = [HOME, MONEY, INCOME, NOTES, READER, MEDIA] as const satisfies readonly ModuleManifest[];

const TIMER = {
  id: "timer",
  title: "Timer",
  icon: Timer,
  blurb: "Countdowns that follow you between apps",
  pinned: true,
  activities: ["timer"],
  windows: [{ id: "timer.window", title: "Timers", icon: Timer, size: { w: 320, h: 360, minW: 260, minH: 220 } }],
} as const satisfies ToolManifest;

/** Shell tools, in dock order. */
export const TOOLS = [TIMER] as const satisfies readonly ToolManifest[];

/** Shell pages that are not apps. They sit at the foot of the rail. */
export const SYSTEM_PAGES: readonly ModuleManifest[] = [
  { id: "settings", title: "Settings", icon: Settings, route: "/settings", blurb: "Theme, timers, passkeys and account" },
];

/** Every widget id the registry offers. Renderers are keyed by it, so a missing one fails typecheck. */
export type WidgetId = (typeof MODULES)[number]["widgets"][number]["id"];

/** Every widget on offer, in picker order. */
export const WIDGETS: readonly (WidgetDef & { id: WidgetId })[] = MODULES.flatMap((m): readonly (WidgetDef & { id: WidgetId })[] => m.widgets);

const WIDGET_IDS: ReadonlySet<string> = new Set(WIDGETS.map((w) => w.id));

export function isWidgetId(id: string): id is WidgetId {
  return WIDGET_IDS.has(id);
}

/** Every mini-window id the registry offers, tools' and apps'. Renderers are keyed by it, so a missing one fails typecheck. */
export type WindowId = (typeof TOOLS)[number]["windows"][number]["id"] | (typeof MODULES)[number]["windows"][number]["id"];

/** Every mini window on offer: tools first, then apps. */
export const WINDOWS: readonly (WindowDef & { id: WindowId })[] = [
  ...TOOLS.flatMap((t): readonly (WindowDef & { id: WindowId })[] => t.windows),
  ...MODULES.flatMap((m): readonly (WindowDef & { id: WindowId })[] => m.windows),
];

const WINDOW_DEFS: ReadonlyMap<string, WindowDef & { id: WindowId }> = new Map(WINDOWS.map((w) => [w.id, w]));

export function isWindowId(id: string): id is WindowId {
  return WINDOW_DEFS.has(id);
}

export function windowDef(id: WindowId): WindowDef & { id: WindowId } {
  const def = WINDOW_DEFS.get(id);
  if (!def) throw new Error(`Unknown window ${id}`);
  return def;
}

/**
 * Segment-aware, not prefix-aware: a bare startsWith would light up /money
 * for /moneyx. Match the route exactly, or as a whole leading segment.
 */
export function isActive(pathname: string, route: string): boolean {
  if (route === "/") return pathname === "/";
  return pathname === route || pathname.startsWith(`${route}/`);
}
