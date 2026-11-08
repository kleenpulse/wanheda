import { describe, expect, it } from "vitest";
import { trackFrom, type Track } from "./library";
import { accrue, countPlay, genreChips, mostPlayed, pruneList, recentGroups, shouldCount, sortByPlays, STEP_MAX_S, type Accrual, type PlayerView, type TrackStat } from "./stats";

const track = (path: string, tags: { title?: string; album?: string; artist?: string; genre?: string; duration?: number } = {}, cover: string | null = null): Track =>
  trackFrom(path, { size: 1, lastModified: 1 }, { title: tags.title ?? path, artist: tags.artist ?? "A", album: tags.album, genre: tags.genre ? [tags.genre] : undefined, duration: tags.duration ?? 200 }, cover);

const stats = (...rows: [path: string, count: number, at: number][]): Map<string, TrackStat> => new Map(rows.map(([path, count, lastPlayedAt]) => [path, { path, count, lastPlayedAt }]));

/** Runs the clock over a list of player views, one step each, `ms` apart. */
function run(views: readonly PlayerView[], ms: number, from: Accrual | null = null, t0 = 0): Accrual | null {
  let a = from;
  views.forEach((v, i) => {
    a = accrue(a, v, t0 + i * ms);
  });
  return a;
}

const playing = (playId = 1, path = "a.mp3"): PlayerView => ({ playId, path, playing: true });
const paused = (playId = 1, path = "a.mp3"): PlayerView => ({ playId, path, playing: false });

describe("accrue", () => {
  it("adds wall time only while playing", () => {
    const a = run([playing(), playing(), paused(), paused(), paused(), playing(), playing()], 1000);
    // play 0→1→2 (2 s), paused 2→5, play 5→6 (1 s)
    expect(a?.playedS).toBe(3);
  });

  it("a scrub to the end never counts: the position isn't time heard", () => {
    // Two seconds of playing, then the head jumps to the last second: the view has no position at all.
    const a = run([playing(), playing(), playing()], 1000);
    expect(a?.playedS).toBe(2);
    expect(shouldCount(a!, 200)).toBe(false);
  });

  it("a new start begins again, the same track looping included", () => {
    const a = run([playing(1), playing(1), playing(1)], 5000);
    expect(a?.playedS).toBe(10);
    const looped = accrue(a, playing(2), 15_000);
    expect(looped).toMatchObject({ playId: 2, playedS: 0, counted: false });
  });

  it("caps one step, so a sleep mid-song isn't listening", () => {
    const a = run([playing(), playing()], 3_600_000);
    expect(a?.playedS).toBe(STEP_MAX_S);
  });

  it("nothing in the player clears it", () => {
    expect(accrue(run([playing()], 1000), { playId: 1, path: null, playing: false }, 2000)).toBeNull();
  });

  it("returns the same object when nothing changed", () => {
    const a = accrue(null, paused(), 0);
    expect(accrue(a, paused(), 500)).toBe(a);
  });
});

describe("shouldCount", () => {
  const at = (playedS: number, counted = false): Accrual => ({ playId: 1, path: "a", playedS, lastAt: null, counted });

  it("counts at 30 s on a long track", () => {
    expect(shouldCount(at(29.9), 300)).toBe(false);
    expect(shouldCount(at(30), 300)).toBe(true);
  });

  it("counts at half a short track", () => {
    expect(shouldCount(at(9), 20)).toBe(false);
    expect(shouldCount(at(10), 20)).toBe(true);
  });

  it("counts at 30 s when the length is unknown", () => {
    expect(shouldCount(at(30), null)).toBe(true);
    expect(shouldCount(at(29), null)).toBe(false);
  });

  it("counts once per start", () => {
    expect(shouldCount(at(100, true), 300)).toBe(false);
  });

  it("countPlay adds one and stamps the time", () => {
    expect(countPlay(undefined, "a", 5)).toEqual({ path: "a", count: 1, lastPlayedAt: 5 });
    expect(countPlay({ path: "a", count: 4, lastPlayedAt: 1 }, "a", 9)).toEqual({ path: "a", count: 5, lastPlayedAt: 9 });
  });
});

describe("pruneList", () => {
  const removed = ["gone.mp3"];
  it("prunes only after a completed scan of the kept folder", () => {
    expect(pruneList({ phase: "done", kept: true, removed })).toEqual(removed);
  });
  it("a failed or cancelled scan never prunes (an unplugged drive keeps its history)", () => {
    expect(pruneList({ phase: "failed", kept: true, removed })).toEqual([]);
    expect(pruneList({ phase: "cancelled", kept: true, removed })).toEqual([]);
  });
  it("a file listed but not opened (a drive pulled mid-scan) keeps its history", () => {
    expect(pruneList({ phase: "done", kept: true, removed: ["gone.mp3", "a.mp3", "b.mp3"], unreadable: ["a.mp3", "b.mp3"] })).toEqual(["gone.mp3"]);
  });
  it("a tab-only or demo scan never prunes", () => {
    expect(pruneList({ phase: "done", kept: false, removed })).toEqual([]);
  });
});

describe("recentGroups", () => {
  const lib = [
    track("Rock/One/01.mp3", { album: "One", artist: "Band" }, "c1"),
    track("Rock/One/02.mp3", { album: "One", artist: "Band" }, "c1"),
    track("Loose/a.mp3", {}, "c2"),
    track("Loose/b.mp3", {}, "c3"),
    track("Other/x.mp3", { album: "Two", artist: "Solo" }),
  ];

  it("albums and folder mixes, most recent first, unplayed left out", () => {
    const out = recentGroups(stats(["Rock/One/02.mp3", 1, 100], ["Loose/b.mp3", 2, 300]), lib);
    expect(out.map((g) => [g.kind, g.label, g.sub])).toEqual([
      ["folder", "Loose", ""],
      ["album", "One", "Band"],
    ]);
    expect(out[0]?.covers).toEqual(["c2", "c3"]);
    expect(out[1]?.tracks.map((t) => t.path)).toEqual(["Rock/One/01.mp3", "Rock/One/02.mp3"]);
    expect(out[1]?.durationS).toBe(400);
  });

  it("stats for paths no longer in the library don't show", () => {
    expect(recentGroups(stats(["elsewhere/z.mp3", 9, 999]), lib)).toEqual([]);
  });
});

describe("mostPlayed and genres", () => {
  const lib = [
    track("a.mp3", { title: "Alpha", genre: "Rock" }),
    track("b.mp3", { title: "Beta", genre: "Jazz" }),
    track("c.mp3", { title: "Gamma" }),
    track("d.mp3", { title: "Delta", genre: "Rock" }),
  ];
  const s = stats(["a.mp3", 3, 10], ["b.mp3", 5, 5], ["c.mp3", 3, 20]);

  it("by count, then most recent; never-played left out", () => {
    expect(mostPlayed(s, lib, null).map((t) => t.path)).toEqual(["b.mp3", "c.mp3", "a.mp3"]);
  });

  it("filters by genre, untagged under Unknown", () => {
    expect(mostPlayed(s, lib, "Rock").map((t) => t.path)).toEqual(["a.mp3"]);
    expect(mostPlayed(s, lib, "Unknown").map((t) => t.path)).toEqual(["c.mp3"]);
  });

  it("chips: the top genres by plays, only when there are two or more", () => {
    expect(genreChips(s, lib)).toEqual(["Jazz", "Rock", "Unknown"]);
    expect(genreChips(stats(["a.mp3", 1, 1], ["d.mp3", 4, 1]), lib)).toEqual([]);
    expect(genreChips(s, lib, 2)).toEqual(["Jazz", "Rock"]);
  });

  it("sortByPlays: played first, the rest in title order", () => {
    expect(sortByPlays(lib, s).map((t) => t.path)).toEqual(["b.mp3", "c.mp3", "a.mp3", "d.mp3"]);
  });
});
