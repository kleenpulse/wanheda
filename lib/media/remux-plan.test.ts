import { describe, expect, it } from "vitest";
import { JobSlot, STARTING_S, needsRestart, restartFrom, type Range } from "./remux-plan";

const writing = (head: number) => ({ head, from: 0, until: 0 });

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("JobSlot", () => {
  it("two quick seeks while a cancel is pending leave exactly one live job", async () => {
    const slot = new JobSlot();
    const j0 = await slot.replace();
    const cancel0 = deferred();
    j0.cancel = () => cancel0.promise;

    const seek1 = slot.replace(); // waits on j0's cancel
    const seek2 = slot.replace(); // arrives before it resolves
    const j2 = await seek2;
    cancel0.resolve();
    const j1 = await seek1;

    expect(j0.cancelled).toBe(true);
    expect(j1.cancelled).toBe(true);
    expect(j2.cancelled).toBe(false);
    expect(slot.current).toBe(j2);
  });

  it("clear cancels the current job and empties the slot", async () => {
    const slot = new JobSlot();
    const j = await slot.replace();
    let stopped = false;
    j.cancel = () => {
      stopped = true;
      return Promise.resolve();
    };
    await slot.clear();
    expect(j.cancelled).toBe(true);
    expect(stopped).toBe(true);
    expect(slot.current).toBeNull();
  });

  it("a failing cancel still settles", async () => {
    const slot = new JobSlot();
    const j = await slot.replace();
    j.cancel = () => Promise.reject(new Error("boom"));
    await expect(slot.replace()).resolves.toMatchObject({ cancelled: false });
  });
});

describe("needsRestart", () => {
  const after: Range[] = [
    [32, 48],
    [50, 80],
  ];

  it("restarts for a seek back into a range left over from before a seek", () => {
    expect(needsRestart(after, 45, writing(80), 120)).toBe(true);
  });

  it("doesn't restart inside the range the job is writing", () => {
    expect(needsRestart(after, 60, writing(80), 120)).toBe(false);
    expect(needsRestart(after, 60, writing(80.9), 120)).toBe(false); // newest fragment not appended yet
  });

  it("restarts outside every range", () => {
    expect(needsRestart(after, 49, writing(80), 120)).toBe(true);
    expect(needsRestart(after, 100, writing(80), 120)).toBe(true);
  });

  it("doesn't restart in a range that already runs to the end of the file", () => {
    expect(needsRestart([[100, 119.8]], 105, null, 120)).toBe(false);
  });

  it("restarts with no job head and no end known", () => {
    expect(needsRestart(after, 45, null, null)).toBe(true);
  });

  it("doesn't restart a job that hasn't written yet for a stall at its own target", () => {
    const starting = { head: null, from: 50, until: 52 + STARTING_S };
    expect(needsRestart(after, 52, starting, 120)).toBe(false);
    expect(needsRestart([], 50, starting, 120)).toBe(false);
    expect(needsRestart([], 70, starting, 120)).toBe(true);
  });

  it("refills only the gap after a stale range", () => {
    expect(restartFrom(after, 45)).toBe(48);
    expect(restartFrom(after, 49)).toBe(49);
  });
});
