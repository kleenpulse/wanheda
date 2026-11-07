import { describe, expect, it } from "vitest";
import { UNKNOWN_ALBUM, UNKNOWN_ARTIST, diffScan, folderOf, groupTracks, isAudioPath, searchTracks, sortSongs, trackFrom } from "./library";

const file = { size: 100, lastModified: 1 };

describe("trackFrom", () => {
  it("keeps tags, trimmed", () => {
    const t = trackFrom("A/B/01 x.flac", file, { title: " Song  One ", artist: "Band", album: "LP", genre: ["Rock"], year: 1999, track: { no: 1 }, disk: { no: 2 }, duration: 201.5 }, "c0ffee");
    expect(t).toMatchObject({ title: "Song One", artist: "Band", album: "LP", albumArtist: "Band", genre: "Rock", year: 1999, trackNo: 1, discNo: 2, durationS: 201.5, coverKey: "c0ffee", folder: "A/B" });
  });

  it("falls back for untagged files: title from the name, Unknown artist", () => {
    const t = trackFrom("Mixes/Night Drive 03.mp3", file, {}, null);
    expect(t).toMatchObject({ title: "Night Drive 03", artist: UNKNOWN_ARTIST, album: UNKNOWN_ALBUM, genre: null, trackNo: null, durationS: null });
  });

  it("uses the album artist when the track artist is missing", () => {
    expect(trackFrom("x.mp3", file, { albumartist: "VA" }, null).artist).toBe("VA");
  });

  it("drops junk numbers", () => {
    expect(trackFrom("x.mp3", file, { track: { no: 0 }, year: Number.NaN, duration: -1 }, null)).toMatchObject({ trackNo: null, year: null, durationS: null });
  });
});

describe("paths", () => {
  it("knows audio files and folders", () => {
    expect(isAudioPath("a/b.FLAC")).toBe(true);
    expect(isAudioPath("a/cover.jpg")).toBe(false);
    expect(isAudioPath("a/notes")).toBe(false);
    expect(folderOf("a/b/c.mp3")).toBe("a/b");
    expect(folderOf("c.mp3")).toBe("");
  });
});

describe("diffScan (incremental, V58)", () => {
  it("parses new and changed files, keeps unchanged, removes missing", () => {
    const known = new Map([
      ["a.mp3", { size: 1, lastModified: 1 }],
      ["b.mp3", { size: 2, lastModified: 2 }],
      ["gone.mp3", { size: 3, lastModified: 3 }],
    ]);
    const r = diffScan(known, [
      { path: "a.mp3", size: 1, lastModified: 1 },
      { path: "b.mp3", size: 2, lastModified: 9 },
      { path: "new.mp3", size: 4, lastModified: 4 },
    ]);
    expect(r.keep).toBe(1);
    expect(r.parse.map((f) => f.path)).toEqual(["b.mp3", "new.mp3"]);
    expect(r.removed).toEqual(["gone.mp3"]);
  });

  it("doesn't re-read a skipped file until it changes", () => {
    const skipped = new Map([
      ["bad.mp3", { size: 5, lastModified: 5 }],
      ["fixed.mp3", { size: 6, lastModified: 6 }],
    ]);
    const r = diffScan(
      new Map(),
      [
        { path: "bad.mp3", size: 5, lastModified: 5 },
        { path: "fixed.mp3", size: 7, lastModified: 9 },
      ],
      skipped,
    );
    expect(r.parse.map((f) => f.path)).toEqual(["fixed.mp3"]);
    expect(r.stillBad.map((f) => f.path)).toEqual(["bad.mp3"]);
    expect(r.removed).toEqual([]);
  });
});

describe("browse and search", () => {
  const tracks = [
    trackFrom("Alpha/LP/02 b.mp3", file, { title: "Beta", artist: "Alpha", album: "LP", track: { no: 2 }, genre: ["Jazz"] }, "k1"),
    trackFrom("Alpha/LP/01 a.mp3", file, { title: "Árbol", artist: "Alpha", album: "LP", track: { no: 1 }, genre: ["Jazz"] }, null),
    trackFrom("Zed/single.mp3", file, { title: "Zz", artist: "Zed" }, null),
    trackFrom("loose.mp3", file, {}, null),
  ];

  it("groups albums in disc and track order, with a cover from any track", () => {
    const albums = groupTracks(tracks, "albums");
    const lp = albums.find((g) => g.label === "LP");
    expect(lp?.tracks.map((t) => t.title)).toEqual(["Árbol", "Beta"]);
    expect(lp?.coverKey).toBe("k1");
  });

  it("groups artists, genres and folders, sorted by label", () => {
    expect(groupTracks(tracks, "artists").map((g) => g.label)).toEqual(["Alpha", UNKNOWN_ARTIST, "Zed"]);
    expect(groupTracks(tracks, "genres").map((g) => [g.label, g.count])).toEqual([
      ["Jazz", 2],
      ["No genre", 2],
    ]);
    expect(groupTracks(tracks, "folders").map((g) => g.label)).toEqual(["Alpha/LP", "Top folder", "Zed"]);
  });

  it("sorts songs by title", () => {
    expect(sortSongs(tracks).map((t) => t.title)).toEqual(["Árbol", "Beta", "loose", "Zz"]);
  });

  it("searches across fields, accent- and case-blind, every word", () => {
    expect(searchTracks(tracks, "arbol").map((t) => t.title)).toEqual(["Árbol"]);
    expect(searchTracks(tracks, "alpha jazz").length).toBe(2);
    expect(searchTracks(tracks, "alpha zed")).toEqual([]);
    expect(searchTracks(tracks, "  ").length).toBe(4);
  });
});
