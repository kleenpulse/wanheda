import { describe, expect, it } from "vitest";
import { settleScrollFade } from "./scroll-fade";

function scroller(scrollHeight: number, clientHeight: number) {
  const writes: string[] = [];
  let reads = 0;
  let animation = "";
  return {
    writes,
    reads: () => reads,
    el: {
      scrollHeight,
      clientHeight,
      getBoundingClientRect() {
        reads++;
        return {};
      },
      style: {
        get animation() {
          return animation;
        },
        set animation(v: string) {
          writes.push(v);
          animation = v;
        },
      },
    },
  };
}

describe("V63 settleScrollFade", () => {
  it("restarts the fade when the list no longer overflows", () => {
    const s = scroller(300, 300);
    expect(settleScrollFade(s.el)).toBe(true);
    expect(s.writes).toEqual(["none", ""]);
    expect(s.reads()).toBe(1);
    expect(s.el.style.animation).toBe("");
  });

  it("leaves a list that still scrolls alone", () => {
    const s = scroller(1120, 300);
    expect(settleScrollFade(s.el)).toBe(false);
    expect(s.writes).toEqual([]);
    expect(s.reads()).toBe(0);
  });
});
