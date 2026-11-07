import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SLOW_REMUX_MS, slowRemuxNotice, useRemuxStatus } from "./remux-status";

const job = { id: "j1", title: "Clip", cancel: () => undefined };

describe("slowRemuxNotice", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useRemuxStatus.setState({ job: null });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a remux that fails in 200 ms leaves no card behind", () => {
    const end = slowRemuxNotice(job);
    vi.advanceTimersByTime(200);
    end(); // remux-failed
    vi.advanceTimersByTime(SLOW_REMUX_MS);
    expect(useRemuxStatus.getState().job).toBeNull();
  });

  it("shows after a slow second, and the first frame clears it", () => {
    const end = slowRemuxNotice(job);
    vi.advanceTimersByTime(SLOW_REMUX_MS);
    expect(useRemuxStatus.getState().job?.id).toBe("j1");
    end();
    expect(useRemuxStatus.getState().job).toBeNull();
  });

  it("never clears another job's card", () => {
    const end = slowRemuxNotice(job);
    useRemuxStatus.getState().show({ ...job, id: "other" });
    end();
    expect(useRemuxStatus.getState().job?.id).toBe("other");
  });
});
