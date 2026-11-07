import { describe, expect, it } from "vitest";
import { TAB_SLOT_PX, splitTabs, tabCapacity } from "./tab-overflow";

const routes = ["home", "money", "income", "notes", "reader", "media", "settings"];

describe("tabCapacity", () => {
  it("counts whole 48 px slots", () => {
    expect(TAB_SLOT_PX).toBe(48);
    expect(tabCapacity(350)).toBe(7);
    expect(tabCapacity(47)).toBe(0);
    expect(tabCapacity(-5)).toBe(0);
  });
});

describe("splitTabs", () => {
  it("everything fits: no More", () => {
    expect(splitTabs(routes, 9, 2, 0)).toEqual({ bar: routes, more: [] });
  });

  it("too many: More takes a slot, the rest overflow in order", () => {
    // 390 px phone: 7 slots, search + account pinned, More ⇒ 4 routes.
    expect(splitTabs(routes, 7, 2, 0)).toEqual({ bar: ["home", "money", "income", "notes"], more: ["reader", "media", "settings"] });
  });

  it("the page you're on stays on the bar, in the last route place", () => {
    expect(splitTabs(routes, 7, 2, 5)).toEqual({ bar: ["home", "money", "income", "media"], more: ["notes", "reader", "settings"] });
  });

  it("an active route already on the bar changes nothing; -1 is no active route", () => {
    expect(splitTabs(routes, 7, 2, 1).bar).toEqual(["home", "money", "income", "notes"]);
    expect(splitTabs(routes, 7, 2, -1).bar).toEqual(["home", "money", "income", "notes"]);
  });

  it("a tiny bar still keeps one route", () => {
    expect(splitTabs(routes, 2, 2, 3)).toEqual({ bar: ["notes"], more: ["home", "money", "income", "reader", "media", "settings"] });
  });
});
