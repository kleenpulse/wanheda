import { describe, expect, test } from "vitest";
import type { UpdateState } from "./bridge";
import { downloadsNow, NO_UPDATE, nextUpdateState, updateMenuLabel, updateNotice, type UpdateEvent } from "./update-state";

const run = (events: UpdateEvent[], from: UpdateState = NO_UPDATE) => events.reduce((state, event) => nextUpdateState(state, event), from);

const auto = (version: string): UpdateEvent => ({ type: "available", version, downloading: true });
const offered = (version: string): UpdateEvent => ({ type: "available", version, downloading: false });

describe("nextUpdateState", () => {
  test("available, progress in whole percents, then ready", () => {
    expect(run([auto("0.8.0")])).toEqual({ kind: "downloading", version: "0.8.0", percent: 0 });
    expect(run([auto("0.8.0"), { type: "progress", percent: 41.7 }])).toEqual({ kind: "downloading", version: "0.8.0", percent: 41 });
    expect(run([auto("0.8.0"), { type: "progress", percent: 99.9 }, { type: "downloaded", version: "0.8.0" }])).toEqual({ kind: "ready", version: "0.8.0" });
  });

  test("returns the same object when the page would show nothing new", () => {
    const downloading = run([auto("0.8.0"), { type: "progress", percent: 12.1 }]);
    expect(nextUpdateState(downloading, { type: "progress", percent: 12.9 })).toBe(downloading);
    expect(nextUpdateState(downloading, auto("0.8.0"))).toBe(downloading);
    const ready: UpdateState = { kind: "ready", version: "0.8.0" };
    expect(nextUpdateState(ready, { type: "downloaded", version: "0.8.0" })).toBe(ready);
    expect(nextUpdateState(NO_UPDATE, { type: "progress", percent: 50 })).toBe(NO_UPDATE);
    const available: UpdateState = { kind: "available", version: "0.8.0" };
    expect(nextUpdateState(available, offered("0.8.0"))).toBe(available);
    expect(nextUpdateState(NO_UPDATE, { type: "download" })).toBe(NO_UPDATE);
  });

  test("progress stays between 0 and 100", () => {
    const downloading: UpdateState = { kind: "downloading", version: "0.8.0", percent: 5 };
    expect(nextUpdateState(downloading, { type: "progress", percent: 140 })).toEqual({ ...downloading, percent: 100 });
    expect(nextUpdateState(downloading, { type: "progress", percent: -3 })).toEqual({ ...downloading, percent: 0 });
    expect(nextUpdateState(downloading, { type: "progress", percent: Number.NaN })).toEqual({ ...downloading, percent: 0 });
  });

  test("a later check doesn't hide a ready update; a newer release replaces it", () => {
    const ready: UpdateState = { kind: "ready", version: "0.8.0" };
    expect(nextUpdateState(ready, auto("0.8.0"))).toBe(ready);
    expect(nextUpdateState(ready, { type: "error" })).toBe(ready);
    // electron-updater deletes the ready installer when the newer download starts.
    const newer = nextUpdateState(ready, auto("0.8.1"));
    expect(newer).toEqual({ kind: "downloading", version: "0.8.1", percent: 0 });
    expect(nextUpdateState(newer, { type: "downloaded", version: "0.8.1" })).toEqual({ kind: "ready", version: "0.8.1" });
  });

  test("a failed download offers the version again; a failed check changes nothing", () => {
    expect(run([auto("0.8.0"), { type: "progress", percent: 30 }, { type: "error" }])).toEqual({ kind: "available", version: "0.8.0" });
    expect(nextUpdateState(NO_UPDATE, { type: "error" })).toBe(NO_UPDATE);
    const available: UpdateState = { kind: "available", version: "0.8.0" };
    expect(nextUpdateState(available, { type: "error" })).toBe(available);
  });

  test("a failed re-check during a download: its progress brings the ring back", () => {
    const shown = run([auto("0.8.0"), { type: "progress", percent: 30 }, { type: "error" }, { type: "progress", percent: 52.4 }]);
    expect(shown).toEqual({ kind: "downloading", version: "0.8.0", percent: 52 });
  });
});

describe("with automatic downloads off", () => {
  test("a found version waits for Download, then downloads and gets ready", () => {
    const available = run([offered("0.8.0")]);
    expect(available).toEqual({ kind: "available", version: "0.8.0" });
    expect(run([{ type: "download" }, { type: "progress", percent: 64.2 }], available)).toEqual({ kind: "downloading", version: "0.8.0", percent: 64 });
    expect(run([{ type: "download" }, { type: "downloaded", version: "0.8.0" }], available)).toEqual({ kind: "ready", version: "0.8.0" });
  });

  test("a newer version replaces the one offered", () => {
    expect(nextUpdateState({ kind: "available", version: "0.8.0" }, offered("0.8.1"))).toEqual({ kind: "available", version: "0.8.1" });
  });

  test("a check that starts nothing keeps a ready update and a download under way", () => {
    const ready: UpdateState = { kind: "ready", version: "0.8.0" };
    expect(nextUpdateState(ready, offered("0.8.1"))).toBe(ready);
    const downloading: UpdateState = { kind: "downloading", version: "0.8.0", percent: 20 };
    expect(nextUpdateState(downloading, offered("0.8.0"))).toBe(downloading);
    expect(nextUpdateState(downloading, offered("0.8.1"))).toBe(downloading);
  });

  test("Download does nothing unless a version is offered", () => {
    const ready: UpdateState = { kind: "ready", version: "0.8.0" };
    expect(nextUpdateState(ready, { type: "download" })).toBe(ready);
    const downloading: UpdateState = { kind: "downloading", version: "0.8.0", percent: 20 };
    expect(nextUpdateState(downloading, { type: "download" })).toBe(downloading);
  });
});

describe("downloadsNow", () => {
  test("automatic downloads on: every found version", () => {
    expect(downloadsNow("0.8.0", true, null)).toBe(true);
  });

  test("off: only the version already downloaded before a quit, so Restart to update comes back", () => {
    expect(downloadsNow("0.8.0", false, "0.8.0")).toBe(true);
    expect(downloadsNow("0.8.1", false, "0.8.0")).toBe(false);
    expect(downloadsNow("0.8.0", false, null)).toBe(false);
    // After a quit: the remembered version is found again, downloads from the cache and is ready.
    const found: UpdateEvent = { type: "available", version: "0.8.0", downloading: downloadsNow("0.8.0", false, "0.8.0") };
    expect(run([found])).toEqual({ kind: "downloading", version: "0.8.0", percent: 0 });
    expect(run([found, { type: "downloaded", version: "0.8.0" }])).toEqual({ kind: "ready", version: "0.8.0" });
  });
});

describe("the notice and the tray item", () => {
  test("say the version and what a click does", () => {
    expect(updateNotice({ kind: "ready", version: "0.8.0" }, { kind: "downloading", version: "0.8.0", percent: 99 })).toEqual({ title: "Wanheda 0.8.0 is ready.", body: "Click to restart and update." });
    expect(updateNotice({ kind: "available", version: "0.8.0" }, NO_UPDATE)).toEqual({ title: "Wanheda 0.8.0 is available.", body: "Click to download it." });
    expect(updateMenuLabel({ kind: "ready", version: "0.8.0" })).toBe("Restart to update to 0.8.0");
    expect(updateMenuLabel({ kind: "available", version: "0.8.0" })).toBe("Download Wanheda 0.8.0");
    for (const state of [NO_UPDATE, { kind: "downloading", version: "0.8.0", percent: 3 }] as UpdateState[]) {
      expect(updateMenuLabel(state)).toBeNull();
      expect(updateNotice(state, NO_UPDATE)).toBeNull();
    }
  });

  test("an offered version is announced once, not after each failed download; a newer one is", () => {
    const available: UpdateState = { kind: "available", version: "0.8.0" };
    expect(updateNotice(available, { kind: "downloading", version: "0.8.0", percent: 40 })).toBeNull();
    expect(updateNotice({ kind: "available", version: "0.8.1" }, available)).not.toBeNull();
  });
});
