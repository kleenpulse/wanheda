import { describe, expect, test } from "vitest";
import type { UpdateState } from "./bridge";
import { NO_UPDATE, nextUpdateState, updateMenuLabel, updateNotice, type UpdateEvent } from "./update-state";

const run = (events: UpdateEvent[], from: UpdateState = NO_UPDATE) => events.reduce((state, event) => nextUpdateState(state, event), from);

describe("nextUpdateState", () => {
  test("available, progress in whole percents, then ready", () => {
    expect(run([{ type: "available", version: "0.8.0" }])).toEqual({ kind: "downloading", version: "0.8.0", percent: 0 });
    expect(run([{ type: "available", version: "0.8.0" }, { type: "progress", percent: 41.7 }])).toEqual({ kind: "downloading", version: "0.8.0", percent: 41 });
    expect(run([{ type: "available", version: "0.8.0" }, { type: "progress", percent: 99.9 }, { type: "downloaded", version: "0.8.0" }])).toEqual({ kind: "ready", version: "0.8.0" });
  });

  test("returns the same object when the page would show nothing new", () => {
    const downloading = run([{ type: "available", version: "0.8.0" }, { type: "progress", percent: 12.1 }]);
    expect(nextUpdateState(downloading, { type: "progress", percent: 12.9 })).toBe(downloading);
    expect(nextUpdateState(downloading, { type: "available", version: "0.8.0" })).toBe(downloading);
    const ready: UpdateState = { kind: "ready", version: "0.8.0" };
    expect(nextUpdateState(ready, { type: "downloaded", version: "0.8.0" })).toBe(ready);
    expect(nextUpdateState(NO_UPDATE, { type: "progress", percent: 50 })).toBe(NO_UPDATE);
  });

  test("progress stays between 0 and 100", () => {
    const downloading: UpdateState = { kind: "downloading", version: "0.8.0", percent: 5 };
    expect(nextUpdateState(downloading, { type: "progress", percent: 140 })).toEqual({ ...downloading, percent: 100 });
    expect(nextUpdateState(downloading, { type: "progress", percent: -3 })).toEqual({ ...downloading, percent: 0 });
    expect(nextUpdateState(downloading, { type: "progress", percent: Number.NaN })).toEqual({ ...downloading, percent: 0 });
  });

  test("a later check doesn't hide a ready update; a newer release replaces it", () => {
    const ready: UpdateState = { kind: "ready", version: "0.8.0" };
    expect(nextUpdateState(ready, { type: "available", version: "0.8.0" })).toBe(ready);
    expect(nextUpdateState(ready, { type: "error" })).toBe(ready);
    // electron-updater deletes the ready installer when the newer download starts.
    const newer = nextUpdateState(ready, { type: "available", version: "0.8.1" });
    expect(newer).toEqual({ kind: "downloading", version: "0.8.1", percent: 0 });
    expect(nextUpdateState(newer, { type: "error" })).toBe(NO_UPDATE);
    expect(nextUpdateState(newer, { type: "downloaded", version: "0.8.1" })).toEqual({ kind: "ready", version: "0.8.1" });
  });

  test("a failed download hides the pill; a failed check changes nothing", () => {
    expect(run([{ type: "available", version: "0.8.0" }, { type: "progress", percent: 30 }, { type: "error" }])).toBe(NO_UPDATE);
    expect(nextUpdateState(NO_UPDATE, { type: "error" })).toBe(NO_UPDATE);
  });
});

describe("the notice and the tray item", () => {
  test("say the version and what a click does, only once ready", () => {
    expect(updateNotice({ kind: "ready", version: "0.8.0" })).toEqual({ title: "Wanheda 0.8.0 is ready.", body: "Click to restart and update." });
    expect(updateMenuLabel({ kind: "ready", version: "0.8.0" })).toBe("Restart to update to 0.8.0");
    for (const state of [NO_UPDATE, { kind: "downloading", version: "0.8.0", percent: 3 }] as UpdateState[]) {
      expect(updateNotice(state)).toBeNull();
      expect(updateMenuLabel(state)).toBeNull();
    }
  });
});
