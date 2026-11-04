import { describe, expect, it } from "vitest";
import {
  MAX_TIMER_MS,
  MINUTE,
  addTime,
  createTimer,
  formatClock,
  formatDuration,
  isDone,
  isRunning,
  labelFor,
  lengthOf,
  parseTimerQuery,
  pause,
  progress,
  remainingMs,
  restart,
  resume,
  sameLength,
} from "./timer";

const T0 = 1_000_000;

describe("timer", () => {
  it("runs down with the wall clock", () => {
    const t = createTimer("a", 25 * MINUTE, T0);
    expect(remainingMs(t, T0)).toBe(25 * MINUTE);
    expect(remainingMs(t, T0 + MINUTE)).toBe(24 * MINUTE);
    expect(progress(t, T0 + 12.5 * MINUTE)).toBeCloseTo(0.5);
    expect(isDone(t, T0 + 25 * MINUTE)).toBe(true);
    expect(remainingMs(t, T0 + 99 * MINUTE)).toBe(0);
  });

  it("freezes while paused and picks up where it left off", () => {
    const t = createTimer("a", 10 * MINUTE, T0);
    const paused = pause(t, T0 + 2 * MINUTE);
    expect(isRunning(paused)).toBe(false);
    expect(remainingMs(paused, T0 + 60 * MINUTE)).toBe(8 * MINUTE);
    const resumed = resume(paused, T0 + 60 * MINUTE);
    expect(remainingMs(resumed, T0 + 61 * MINUTE)).toBe(7 * MINUTE);
  });

  it("ignores pause on a finished timer and resume on a running one", () => {
    const t = createTimer("a", MINUTE, T0);
    expect(pause(t, T0 + 2 * MINUTE)).toBe(t);
    expect(resume(t, T0)).toBe(t);
  });

  it("adds time while running, while paused, and restarts a finished timer", () => {
    const t = createTimer("a", 10 * MINUTE, T0);
    const more = addTime(t, 5 * MINUTE, T0 + MINUTE);
    expect(remainingMs(more, T0 + MINUTE)).toBe(14 * MINUTE);
    expect(more.totalMs).toBe(15 * MINUTE);

    const paused = addTime(pause(t, T0), 5 * MINUTE, T0 + 30 * MINUTE);
    expect(isRunning(paused)).toBe(false);
    expect(remainingMs(paused, T0 + 99 * MINUTE)).toBe(15 * MINUTE);

    const again = addTime(t, 5 * MINUTE, T0 + 20 * MINUTE);
    expect(isRunning(again)).toBe(true);
    expect(remainingMs(again, T0 + 20 * MINUTE)).toBe(5 * MINUTE);
    expect(progress(again, T0 + 20 * MINUTE)).toBe(1);
  });

  it("never exceeds a day", () => {
    const t = createTimer("a", MAX_TIMER_MS, T0);
    expect(addTime(t, 60 * MINUTE, T0).totalMs).toBe(MAX_TIMER_MS);
  });
});

describe("formatClock", () => {
  it.each([
    [25 * MINUTE, "25:00"],
    [65_000, "1:05"],
    [500, "0:01"],
    [0, "0:00"],
    [-5, "0:00"],
    [3_909_000, "1:05:09"],
  ])("%d ms → %s", (ms, text) => {
    expect(formatClock(ms)).toBe(text);
  });
});

describe("parseTimerQuery", () => {
  it.each([
    ["25", 25 * MINUTE],
    ["25m", 25 * MINUTE],
    ["25 min", 25 * MINUTE],
    ["Timer 10", 10 * MINUTE],
    ["timer 10 minutes", 10 * MINUTE],
    ["90s", 90_000],
    ["1h", 60 * MINUTE],
    ["1h30", 90 * MINUTE],
    ["2 hours 15 min", 135 * MINUTE],
  ])("%j → %d ms", (query, ms) => {
    expect(parseTimerQuery(query)).toBe(ms);
  });

  it.each(["", "settings", "0", "25x", "1441", "timer", "-5", "1.5"])("%j → null", (query) => {
    expect(parseTimerQuery(query)).toBeNull();
  });
});

describe("formatDuration", () => {
  it.each([
    [90_000, "1 min 30 sec"],
    [0, "0 sec"],
    [30_000, "30 sec"],
    [25 * MINUTE, "25 min"],
    [60 * MINUTE, "1 h"],
    [90 * MINUTE, "1 h 30 min"],
  ])("%d ms → %s", (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});

describe("repeat timers", () => {
  it("finds a timer by the length it was started with, even after time was added", () => {
    const t = addTime(createTimer("a", 25 * MINUTE, T0), 5 * MINUTE, T0);
    expect(lengthOf(t)).toBe(25 * MINUTE);
    expect(sameLength([t], 25 * MINUTE)?.id).toBe("a");
    expect(sameLength([t], 30 * MINUTE)).toBeUndefined();
  });

  it("falls back to the total for timers stored before setMs existed", () => {
    const { setMs: _, ...old } = createTimer("a", 10 * MINUTE, T0);
    expect(lengthOf(old)).toBe(10 * MINUTE);
    expect(sameLength([old], 10 * MINUTE)?.id).toBe("a");
  });

  it("numbers a repeated length so the two can be told apart", () => {
    const first = createTimer("a", 25 * MINUTE, T0);
    expect(labelFor([], 25 * MINUTE)).toBe("25 min timer");
    expect(labelFor([first], 25 * MINUTE)).toBe("25 min timer 2");
    const second = createTimer("b", 25 * MINUTE, T0, "25 min timer 2");
    expect(labelFor([first, second], 25 * MINUTE)).toBe("25 min timer 3");
    expect(labelFor([second], 25 * MINUTE)).toBe("25 min timer");
  });

  it("restarts a finished timer at its original length, keeping id and label", () => {
    const done = createTimer("a", 5 * MINUTE, T0, "Tea");
    const later = T0 + 10 * MINUTE;
    expect(isDone(done, later)).toBe(true);
    const again = restart(addTime(done, 0, later), later);
    expect(again).toMatchObject({ id: "a", label: "Tea", totalMs: 5 * MINUTE, endsAt: later + 5 * MINUTE });
  });
});
