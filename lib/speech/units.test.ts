import { describe, expect, it } from "vitest";
import { UNIT_MAX, UNIT_MIN, budgetCap, cutUnit, nextCap, skipSpaces } from "./units";

/** Every unit of a text at a fixed cap. */
function units(text: string, cap: number): string[] {
  const out: string[] = [];
  let from = 0;
  while (from < text.length) {
    const end = cutUnit(text, from, cap);
    out.push(text.slice(from, end).trim());
    from = skipSpaces(text, end);
  }
  return out;
}

describe("cutUnit", () => {
  it("keeps a sentence that fits whole", () => {
    expect(units("A short sentence.", 60)).toEqual(["A short sentence."]);
  });

  it("prefers a clause end in the back half of the window", () => {
    const text = "When the light came over the hills at dawn, the whole valley woke up and went to work.";
    expect(units(text, 60)[0]).toBe("When the light came over the hills at dawn,");
  });

  it("falls back to the last space", () => {
    const text = "one two three four five six seven eight nine ten eleven twelve thirteen";
    const [first] = units(text, 30);
    expect(first).toBe("one two three four five six");
    expect(first!.length).toBeLessThanOrEqual(30);
  });

  it("cuts hard in a run with no spaces, never inside a surrogate pair", () => {
    const text = "x".repeat(59) + "🚀".repeat(10);
    const end = cutUnit(text, 0, 60);
    expect(end).toBe(59);
    for (const u of units(text, 60)) expect(u).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
  });

  it("loses no text and keeps every piece within the cap", () => {
    const text = `Lorem ipsum, ${"dolor sit amet ".repeat(30)}consectetur; adipiscing elit.`;
    const pieces = units(text, 60);
    expect(pieces.join(" ").replace(/\s+/g, " ")).toBe(text.replace(/\s+/g, " "));
    for (const p of pieces) expect(p.length).toBeLessThanOrEqual(60);
  });
});

describe("ramp", () => {
  it("doubles at a fast RTF, up to the max", () => {
    expect(nextCap(60, 0.38)).toBe(120);
    expect(nextCap(120, 0.38)).toBe(UNIT_MAX);
    expect(nextCap(UNIT_MAX, 0.1)).toBe(UNIT_MAX);
  });

  it("grows slower in a throttled tab", () => {
    expect(nextCap(60, 0.6)).toBe(80);
  });

  it("stays at the floor once RTF reaches 0.8", () => {
    expect(nextCap(60, 0.8)).toBe(UNIT_MIN);
    expect(nextCap(60, 1.5)).toBe(UNIT_MIN);
  });

  it("budget: nothing queued means the smallest unit", () => {
    expect(budgetCap(0, 0.4, 1 / 15)).toBe(UNIT_MIN);
  });

  it("budget: the synthesis fits in 80 % of the queued audio", () => {
    // 4 s queued at RTF 0.4, 15 chars/s: 0.8 × 4 / (0.4 / 15) = 120 chars.
    expect(budgetCap(4, 0.4, 1 / 15)).toBe(120);
    expect(budgetCap(60, 0.4, 1 / 15)).toBe(UNIT_MAX);
  });
});
