import { describe, expect, it } from "vitest";
import { WIDGETS } from "@/lib/modules";
import {
  BREAKPOINT_NAMES,
  COLS,
  addWidget,
  nudge,
  removeWidget,
  resolveLayouts,
  sanitizeLayout,
  seedLayouts,
  sizeLimits,
  widgetsOn,
  type BoardItem,
  type BoardLayouts,
} from "./layout";

function overlaps(a: BoardItem, b: BoardItem) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function assertClean(layouts: BoardLayouts) {
  for (const bp of BREAKPOINT_NAMES) {
    const layout = layouts[bp];
    expect(new Set(layout.map((i) => i.i)).size).toBe(layout.length);
    for (const item of layout) {
      const lim = sizeLimits(item.i, COLS[bp]);
      expect(item.x).toBeGreaterThanOrEqual(0);
      expect(item.x + item.w).toBeLessThanOrEqual(COLS[bp]);
      expect(item.w).toBeGreaterThanOrEqual(lim.minW);
      expect(item.w).toBeLessThanOrEqual(lim.maxW);
      expect(item.h).toBeGreaterThanOrEqual(lim.minH);
      expect(item.h).toBeLessThanOrEqual(lim.maxH);
      for (const other of layout) if (other !== item) expect(overlaps(item, other)).toBe(false);
    }
  }
}

describe("seedLayouts", () => {
  it("is clean and carries every widget on every breakpoint", () => {
    const seed = seedLayouts();
    assertClean(seed);
    for (const bp of BREAKPOINT_NAMES) {
      expect(seed[bp].map((i) => i.i).sort()).toEqual(WIDGETS.map((w) => w.id).sort());
    }
  });

  it("is a fixed point of sanitizeLayout", () => {
    const seed = seedLayouts();
    for (const bp of BREAKPOINT_NAMES) expect(sanitizeLayout(seed[bp], bp)).toEqual(seed[bp]);
  });
});

describe("sanitizeLayout", () => {
  it("drops unknown and duplicate widgets", () => {
    const out = sanitizeLayout(
      [
        { i: "home.clock", x: 0, y: 0, w: 4, h: 2 },
        { i: "evil.widget", x: 4, y: 0, w: 4, h: 2 },
        { i: "home.clock", x: 8, y: 0, w: 4, h: 2 },
      ],
      "lg",
    );
    expect(out.map((i) => i.i)).toEqual(["home.clock"]);
  });

  it("clamps size to the widget's limits and the board, and keeps it on the board", () => {
    const [clock] = sanitizeLayout([{ i: "home.clock", x: 11, y: -5, w: 99, h: 0.4 }], "sm");
    expect(clock).toEqual({ i: "home.clock", x: 0, y: 0, w: 4, h: 2 });
  });

  it("rounds fractional cells", () => {
    const [clock] = sanitizeLayout([{ i: "home.clock", x: 1.4, y: 0, w: 3.6, h: 2.2 }], "lg");
    expect(clock).toMatchObject({ x: 1, w: 4, h: 2 });
  });

  it("resolves overlaps by pushing down", () => {
    const out = sanitizeLayout(
      [
        { i: "home.clock", x: 0, y: 0, w: 4, h: 2 },
        { i: "home.weather", x: 2, y: 0, w: 4, h: 2 },
      ],
      "lg",
    );
    expect(out).toHaveLength(2);
    const [a, b] = out as [BoardItem, BoardItem];
    expect(overlaps(a, b)).toBe(false);
  });

  it("does not mutate its input", () => {
    const raw = [{ i: "home.clock", x: 0, y: 5, w: 4, h: 2 }];
    sanitizeLayout(raw, "lg");
    expect(raw[0]).toEqual({ i: "home.clock", x: 0, y: 5, w: 4, h: 2 });
  });
});

describe("resolveLayouts", () => {
  it("falls back to the seed when nothing valid is stored", () => {
    expect(resolveLayouts(null)).toEqual(seedLayouts());
    expect(resolveLayouts({})).toEqual(seedLayouts());
    expect(resolveLayouts({ lg: "not a layout", xl: [] })).toEqual(seedLayouts());
  });

  it("keeps an empty board empty", () => {
    expect(resolveLayouts({ lg: [], md: [], sm: [] })).toEqual({ lg: [], md: [], sm: [] });
  });

  it("fills a breakpoint that was never saved from the seed, limited to the widgets on the board", () => {
    const out = resolveLayouts({ lg: [{ i: "home.clock", x: 0, y: 0, w: 6, h: 3 }] });
    expect(out.lg).toEqual([{ i: "home.clock", x: 0, y: 0, w: 6, h: 3 }]);
    expect(out.sm.map((i) => i.i)).toEqual(["home.clock"]);
    expect(out.md.map((i) => i.i)).toEqual(["home.clock"]);
  });

  it("places a widget missing from one breakpoint at its bottom", () => {
    const out = resolveLayouts({
      lg: [
        { i: "home.clock", x: 0, y: 0, w: 4, h: 2 },
        { i: "home.weather", x: 4, y: 0, w: 4, h: 2 },
      ],
      sm: [{ i: "home.clock", x: 0, y: 0, w: 4, h: 2 }],
    });
    expect(out.sm).toEqual([
      { i: "home.clock", x: 0, y: 0, w: 4, h: 2 },
      { i: "home.weather", x: 0, y: 2, w: 4, h: 2 },
    ]);
    assertClean(out);
  });
});

describe("addWidget / removeWidget", () => {
  it("removes from every breakpoint and closes the gap", () => {
    const out = removeWidget(seedLayouts(), "home.clock");
    expect(widgetsOn(out)).not.toContain("home.clock");
    expect(out.sm[0]).toMatchObject({ i: "home.weather", y: 0 });
    assertClean(out);
  });

  it("adds to every breakpoint at the bottom, once", () => {
    const without = removeWidget(seedLayouts(), "home.note");
    const out = addWidget(without, "home.note");
    for (const bp of BREAKPOINT_NAMES) expect(out[bp].filter((i) => i.i === "home.note")).toHaveLength(1);
    expect(addWidget(out, "home.note")).toEqual(out);
    assertClean(out);
  });
});

describe("nudge", () => {
  const row: BoardItem[] = [
    { i: "home.clock", x: 0, y: 0, w: 4, h: 2 },
    { i: "home.weather", x: 4, y: 0, w: 4, h: 2 },
  ];

  it("moves right and stops at the edge", () => {
    const moved = nudge([{ i: "home.clock", x: 0, y: 0, w: 4, h: 2 }], "home.clock", "right", "move", "lg");
    expect(moved).toEqual([{ i: "home.clock", x: 1, y: 0, w: 4, h: 2 }]);
    expect(nudge([{ i: "home.clock", x: 8, y: 0, w: 4, h: 2 }], "home.clock", "right", "move", "lg")).toBeNull();
    expect(nudge([{ i: "home.clock", x: 0, y: 0, w: 4, h: 2 }], "home.clock", "left", "move", "lg")).toBeNull();
  });

  it("moving down jumps past the widget below instead of floating back", () => {
    const stack: BoardItem[] = [
      { i: "home.clock", x: 0, y: 0, w: 4, h: 2 },
      { i: "home.weather", x: 0, y: 2, w: 4, h: 2 },
    ];
    const out = nudge(stack, "home.clock", "down", "move", "sm");
    expect(out?.find((i) => i.i === "home.weather")?.y).toBe(0);
    expect(out?.find((i) => i.i === "home.clock")?.y).toBe(2);
  });

  it("a lone widget at the top cannot move up or down", () => {
    const lone: BoardItem[] = [{ i: "home.clock", x: 0, y: 0, w: 4, h: 2 }];
    expect(nudge(lone, "home.clock", "up", "move", "lg")).toBeNull();
    expect(nudge(lone, "home.clock", "down", "move", "lg")).toBeNull();
  });

  it("resizes within limits and pushes neighbours, not itself", () => {
    const out = nudge(row, "home.clock", "right", "resize", "lg");
    expect(out?.find((i) => i.i === "home.clock")).toEqual({ i: "home.clock", x: 0, y: 0, w: 5, h: 2 });
    const weather = out?.find((i) => i.i === "home.weather");
    expect(weather && overlaps(weather, { i: "home.clock", x: 0, y: 0, w: 5, h: 2 })).toBe(false);
    expect(nudge(row, "home.clock", "up", "resize", "lg")).toBeNull(); // already minH
  });

  it("never mutates the layout it is given", () => {
    const before = structuredClone(row);
    nudge(row, "home.clock", "right", "move", "lg");
    nudge(row, "home.clock", "down", "resize", "lg");
    expect(row).toEqual(before);
  });
});
