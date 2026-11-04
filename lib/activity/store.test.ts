import { afterEach, describe, expect, it, vi } from "vitest";
import { useActivity } from "./store";
import { MINUTE, isDone } from "./timer";

const T0 = 1_000_000;

afterEach(() => {
  vi.useRealTimers();
  useActivity.setState({ timers: [], lastStarted: null, lastStartedAt: 0, timerMode: "single" });
});

describe("startTimer", () => {
  it("brings a running timer of the same length forward instead of starting a twin (default)", () => {
    vi.useFakeTimers({ now: T0 });
    const { startTimer } = useActivity.getState();
    const first = startTimer(25 * MINUTE);
    vi.setSystemTime(T0 + MINUTE);
    const again = startTimer(25 * MINUTE);
    const s = useActivity.getState();
    expect(again).toBe(first);
    expect(s.timers).toHaveLength(1);
    expect(s.lastStarted).toBe(first);
    expect(s.lastStartedAt).toBe(T0 + MINUTE);
    // Running on, not reset.
    expect(s.timers[0]?.endsAt).toBe(T0 + 25 * MINUTE);
  });

  it("starts a finished timer of that length over, in place", () => {
    vi.useFakeTimers({ now: T0 });
    const { startTimer } = useActivity.getState();
    const id = startTimer(5 * MINUTE);
    const later = T0 + 10 * MINUTE;
    vi.setSystemTime(later);
    expect(startTimer(5 * MINUTE)).toBe(id);
    const [t] = useActivity.getState().timers;
    expect(t && isDone(t, later)).toBe(false);
    expect(t?.endsAt).toBe(later + 5 * MINUTE);
  });

  it("still starts different lengths side by side", () => {
    const { startTimer } = useActivity.getState();
    startTimer(25 * MINUTE);
    startTimer(5 * MINUTE);
    expect(useActivity.getState().timers.map((t) => t.label)).toEqual(["25 min timer", "5 min timer"]);
  });

  it("allows numbered repeats when the owner chooses it", () => {
    useActivity.setState({ timerMode: "multiple" });
    const { startTimer } = useActivity.getState();
    const a = startTimer(25 * MINUTE);
    const b = startTimer(25 * MINUTE);
    expect(a).not.toBe(b);
    expect(useActivity.getState().timers.map((t) => t.label)).toEqual(["25 min timer", "25 min timer 2"]);
  });
});
