import { describe, expect, test } from "vitest";
import { buildIslandSnapshot, sameSnapshot, type SnapshotInput } from "./snapshot";

const empty: SnapshotInput = { music: null, speech: null, downloads: [], remux: null, scan: null, alerts: [], lastTimer: null, lastTimerAt: 0 };

describe("buildIslandSnapshot", () => {
  test("nothing live is an empty snapshot", () => {
    expect(buildIslandSnapshot(empty)).toEqual({ items: [], lastTimer: null, lastTimerAt: 0 });
  });

  test("media and speech, with progress and a same-app path only", () => {
    const s = buildIslandSnapshot({
      ...empty,
      music: { title: "Song", artist: "Band", coverKey: "sha:ab12", playing: true, startedAt: 10 },
      speech: { title: "A note", sentence: 4, total: 10, paused: true, href: "/notes?n=1", startedAt: 20 },
    });
    expect(s.items).toEqual([
      { kind: "media", id: "media", title: "Song", artist: "Band", coverKey: "sha:ab12", playing: true, startedAt: 10 },
      { kind: "speech", id: "speech", title: "A note", progress: 0.5, paused: true, path: "/notes?n=1", startedAt: 20 },
    ]);
    const odd = buildIslandSnapshot({ ...empty, music: { title: "S", artist: "", coverKey: "../x", playing: false, startedAt: Number.NaN }, speech: { title: "T", sentence: 0, total: 0, paused: false, href: "https://evil.test", startedAt: 1 } });
    expect(odd.items[0]).toMatchObject({ coverKey: null, startedAt: 0 });
    expect(odd.items[1]).toMatchObject({ progress: 0, path: null });
  });

  test("transfers: downloads, the remux and the music scan", () => {
    const s = buildIslandSnapshot({
      ...empty,
      downloads: [
        { id: "amy", label: "Amy", phase: "downloading", received: 25, total: 100 },
        { id: "joe", label: "Joe", phase: "queued", received: 0, total: 0 },
        { id: "kim", label: "Kim", phase: "failed", received: 0, total: 0 },
      ],
      remux: "Film.mkv",
      scan: { failed: false, parsed: 30, toParse: 60 },
    });
    expect(s.items.map((i) => (i.kind === "transfer" ? [i.id, i.detail, i.progress, i.failed] : null))).toEqual([
      ["transfer:amy", "Downloading, 25%", 0.25, false],
      ["transfer:joe", "Waiting for the download ahead", null, false],
      ["transfer:kim", "Download failed", null, true],
      ["remux", "Preparing to play", null, false],
      ["scan", "30 of 60 files", 0.5, false],
    ]);
  });

  test("alerts keep the notice's text, clipped to the shell's limits", () => {
    const s = buildIslandSnapshot({ ...empty, alerts: [{ id: "money:n1", noticeId: "n1", tag: "money", title: "t".repeat(400), body: null, href: "/money/budgets" }] });
    const a = s.items[0];
    expect(a?.kind === "alert" && a.title.length).toBe(200);
    expect(a).toMatchObject({ body: "", path: "/money/budgets", noticeId: "n1", tag: "money" });
  });

  test("never more items than the shell takes", () => {
    const downloads = Array.from({ length: 40 }, (_, i) => ({ id: `v${String(i)}`, label: "V", phase: "queued", received: 0, total: 0 }));
    expect(buildIslandSnapshot({ ...empty, downloads }).items).toHaveLength(24);
  });
});

describe("sameSnapshot", () => {
  test("by content", () => {
    const a = buildIslandSnapshot({ ...empty, remux: "x" });
    expect(sameSnapshot(null, a)).toBe(false);
    expect(sameSnapshot(a, buildIslandSnapshot({ ...empty, remux: "x" }))).toBe(true);
    expect(sameSnapshot(a, buildIslandSnapshot({ ...empty, remux: "y" }))).toBe(false);
  });
});
