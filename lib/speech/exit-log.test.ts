import { afterEach, describe, expect, it, vi } from "vitest";
import { EXIT_LOG_FLAG, ExitLog, exitLogOn, startExitLog } from "./exit-log";

// The Phase 6 exit log (SPEC V50, T58): queue lines → wall-clock numbers.

function fakeClock(start = 1000) {
  let t = start;
  return { now: () => t, set: (ms: number) => (t = ms) };
}

describe("ExitLog", () => {
  it("first audio = the first unit's start on the page clock − the press", () => {
    const clock = fakeClock(1200);
    const log = new ExitLog("en_US-test", 1000, clock.now);
    // Scheduled at page time 1200, to start 0.03 s later on the audio clock.
    log.entry({ kind: "unit", sentence: 0, from: 0, chars: 40, at: 5.03, now: 5, gapMs: null, underrun: false, synthMs: 180, rtf: 0.4, cached: 1 });
    expect(log.summary().firstAudioMs).toBe(230);
  });

  it("max gap across units, underruns, lateness and cache peak", () => {
    const clock = fakeClock();
    const log = new ExitLog("v", 0, clock.now);
    const unit = { kind: "unit" as const, sentence: 0, from: 0, chars: 10, at: 1, now: 1, synthMs: 10, rtf: 0.4, cached: 1 };
    log.entry({ ...unit, gapMs: null, underrun: false });
    log.entry({ ...unit, gapMs: 0, underrun: false, cached: 4 });
    log.entry({ ...unit, gapMs: 72.4, underrun: true, rtf: 1.1, cached: 2 });
    for (const lateMs of [10, 40, 20]) log.entry({ kind: "sentence", sentence: 0, lateMs });
    const s = log.summary();
    expect(s).toMatchObject({ units: 3, maxGapMs: 72.4, underruns: 1, switches: 3, lateP50Ms: 20, lateMaxMs: 40, rtf: 1.1, maxCached: 4 });
  });

  it("marks keep the first time of each step, after the press", () => {
    const clock = fakeClock(1300);
    const log = new ExitLog("v", 1000, clock.now);
    log.mark("play", 1040);
    log.mark("synth-sent");
    clock.set(1900);
    log.mark("synth-sent");
    log.mark("synth-back");
    expect(log.summary().marks).toEqual({ play: 40, "synth-sent": 300, "synth-back": 900 });
  });

  it("an empty run has no first audio and zero gaps", () => {
    const s = new ExitLog("v", 0, fakeClock().now).summary();
    expect(s).toMatchObject({ firstAudioMs: null, units: 0, maxGapMs: 0, lateP50Ms: null, rtf: null });
  });

  it("end() freezes the summary, prints once and ignores later lines", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const log = new ExitLog("v", 0, fakeClock().now);
    const first = log.end();
    log.entry({ kind: "sentence", sentence: 3, lateMs: 5 });
    expect(log.end()).toBe(first);
    expect(log.summary().switches).toBe(0);
    expect(info).toHaveBeenCalledTimes(1);
    info.mockRestore();
  });
});

describe("the flag", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is off without localStorage, and on only for \"1\"", () => {
    expect(exitLogOn()).toBe(false);
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null });
    expect(exitLogOn()).toBe(false);
    expect(startExitLog("v", 0, 0)).toBeNull();
    store.set(EXIT_LOG_FLAG, "1");
    expect(startExitLog("v", 0, 0)).toBeInstanceOf(ExitLog);
    const handle = (globalThis as { wanhedaSpeech?: { summary: () => unknown } }).wanhedaSpeech;
    expect(handle?.summary()).toMatchObject({ voice: "v", units: 0 });
  });
});
