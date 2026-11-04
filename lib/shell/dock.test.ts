import { House, Music, Timer } from "lucide-react";
import { describe, expect, it } from "vitest";
import { MODULES, TOOLS, type ModuleManifest, type ToolManifest, type WindowId } from "@/lib/modules";
import { dockEntries, type DockState } from "./dock";

const IDLE: DockState = { live: new Set(), open: new Set() };

const APPS: ModuleManifest[] = [
  { id: "home", title: "Home", icon: House, route: "/", blurb: "", pinned: true },
  { id: "media", title: "Media", icon: Music, route: "/settings", blurb: "", activities: ["media"] },
];

const TIMER_TOOL: ToolManifest = {
  id: "timer",
  title: "Timer",
  icon: Timer,
  blurb: "",
  activities: ["timer"],
  windows: [{ id: "timer.window", title: "Timers", icon: Timer, size: { w: 1, h: 1, minW: 1, minH: 1 } }],
};

describe("dockEntries", () => {
  it("shows pinned entries when nothing runs, and hides the rest", () => {
    const { apps, tools } = dockEntries(APPS, [TIMER_TOOL], IDLE);
    expect(apps.map((a) => [a.id, a.running])).toEqual([["home", false]]);
    expect(tools).toEqual([]);
  });

  it("shows an unpinned entry while one of its activities is live", () => {
    const { apps, tools } = dockEntries(APPS, [TIMER_TOOL], { live: new Set(["media", "timer"]), open: new Set() });
    expect(apps.map((a) => [a.id, a.running])).toEqual([
      ["home", false],
      ["media", true],
    ]);
    expect(tools.map((t) => [t.id, t.running])).toEqual([["timer", true]]);
  });

  it("counts an open mini window as running, and targets it", () => {
    const open = new Set<WindowId>(["timer.window"]);
    const { tools } = dockEntries(APPS, [TIMER_TOOL], { live: new Set(), open });
    expect(tools).toMatchObject([{ id: "timer", running: true, target: { kind: "window", window: "timer.window" } }]);
  });

  it("drops a tool with no known window", () => {
    const orphan: ToolManifest = { id: "x", title: "X", icon: Timer, blurb: "", pinned: true };
    expect(dockEntries([], [orphan], IDLE).tools).toEqual([]);
  });

  it("pins Home and the timer in the real registry", () => {
    const { apps, tools } = dockEntries(MODULES, TOOLS, IDLE);
    expect(apps.map((a) => a.id)).toEqual(["home"]);
    expect(tools.map((t) => t.id)).toEqual(["timer"]);
  });
});
