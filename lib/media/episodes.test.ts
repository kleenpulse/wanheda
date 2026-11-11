import { describe, expect, it } from "vitest";
import { cleanTitle, displayTitle, folderFor, folderGroups, folderLabel, LOOSE_LABEL, parseEpisode, playOrder, railItems, seasonsOf, showsOf, upNext } from "./episodes";
import type { MediaItem } from "./types";

describe("parseEpisode", () => {
  it("reads S01E11 and the show before it", () => {
    expect(parseEpisode("Night.Harbor.S01E11.1080p.WEB-DL.x264.mkv")).toEqual({ show: "Night Harbor", showKey: "nightharbor", season: 1, episode: 11, name: null });
    expect(parseEpisode("Night Harbor - s2e5 - The Reunion.mp4")).toMatchObject({ show: "Night Harbor", season: 2, episode: 5, name: "The Reunion" });
    expect(parseEpisode("Show.S01.E05.mkv")).toMatchObject({ season: 1, episode: 5 });
  });

  it("reads 1x11 and Episode 11", () => {
    expect(parseEpisode("Show 1x11.mkv")).toMatchObject({ show: "Show", season: 1, episode: 11 });
    expect(parseEpisode("Show Season 2 Episode 3.mkv")).toMatchObject({ show: "Show", season: 2, episode: 3 });
    expect(parseEpisode("Show Ep.7.mkv")).toMatchObject({ show: "Show", season: 1, episode: 7 });
  });

  it("never reads a resolution, a codec, a year or audio channels as an episode", () => {
    expect(parseEpisode("1920x1080.mp4")).toBeNull();
    expect(parseEpisode("Holiday 1280x720.mp4")).toBeNull();
    expect(parseEpisode("Holiday.x264.mkv")).toBeNull();
    expect(parseEpisode("Holiday.x265.HEVC.mkv")).toBeNull();
    expect(parseEpisode("Keynote E3 2019.mp4")).toBeNull();
    expect(parseEpisode("Concert H.265 5.1.mkv")).toBeNull();
    expect(parseEpisode("Deep 5.mp4")).toBeNull();
    expect(parseEpisode("Harbor Lights (2024).mkv")).toBeNull();
  });

  it("takes the show from the folder when the file names only the episode", () => {
    expect(parseEpisode("Episode 11.mkv", "Hometown")).toMatchObject({ show: "Hometown", season: 1, episode: 11 });
    expect(parseEpisode("Episode 4.mkv", "Hometown/Season 2")).toMatchObject({ show: "Hometown", season: 2, episode: 4 });
    expect(parseEpisode("S01E03.mkv", "Night Harbor (2021)")).toMatchObject({ show: "Night Harbor", episode: 3 });
    expect(parseEpisode("Episode 11.mkv")).toBeNull();
  });

  it("joins spellings of one show", () => {
    expect(parseEpisode("The.Office.US.S02E01.mkv")?.showKey).toBe(parseEpisode("The Office (US) - S02E02.mkv")?.showKey);
  });

  it("takes the first episode of a multi-episode file (a known miss)", () => {
    expect(parseEpisode("Show.S01E01E02.mkv")).toMatchObject({ episode: 1 });
  });
});

describe("cleanTitle", () => {
  it("drops the extension, release tags and dots", () => {
    expect(cleanTitle("Harbor.Lights.2024.1080p.BluRay.x264-GROUP.mkv")).toBe("Harbor Lights 2024");
    expect(cleanTitle("[Group] My_Film.mp4")).toBe("My Film");
    expect(cleanTitle("Harbor Lights (2024)")).toBe("Harbor Lights (2024)");
    expect(cleanTitle("x264")).toBe("x264");
  });
});

const at = (id: string, uri: string, source: MediaItem["source"] = "local", folder?: string): MediaItem => ({
  id,
  kind: "video",
  source,
  fp: id,
  uri,
  title: uri,
  durationS: null,
  meta: folder ? { folder } : {},
  watchLaterAt: null,
  progress: null,
  createdAt: "",
  updatedAt: "",
});

describe("playOrder and upNext", () => {
  // Newest first, as the library lists them: the episodes are out of order here.
  const items = [
    at("e3", "Show.S01E03.mkv"),
    at("x", "Holiday.mp4"),
    at("e1", "Show.S01E01.mkv"),
    at("s2", "Show.S02E01.mkv"),
    at("yt", "https://youtu.be/abc", "embed"),
    at("e2", "Show.S01E02.mkv"),
  ];

  it("plays a show in season and episode order", () => {
    const e1 = items[2];
    if (!e1) throw new Error("fixture");
    expect(playOrder(items, e1).map((i) => i.id)).toEqual(["e1", "e2", "e3", "s2"]);
    expect(upNext(items, e1).map((i) => i.id)).toEqual(["e2", "e3", "s2"]);
  });

  it("plays anything else down the library list, never into an embed", () => {
    const x = items[1];
    if (!x) throw new Error("fixture");
    expect(upNext(items, x).map((i) => i.id)).toEqual(["e1", "s2", "e2"]);
  });

  it("lists the show's seasons", () => {
    const e1 = items[2];
    const x = items[1];
    if (!e1 || !x) throw new Error("fixture");
    expect(seasonsOf(items, e1)).toEqual([1, 2]);
    expect(seasonsOf(items, x)).toEqual([]);
  });
});

describe("displayTitle", () => {
  it("names an episode by its line, and anything else cleaned", () => {
    expect(displayTitle(at("a", "Night.Harbor.S01E02.720p.WEB-DL.x264.mp4"))).toEqual({ title: "Episode 2", show: "Night Harbor", line: "Season 1 · Episode 2" });
    expect(displayTitle(at("b", "Harbor.Lights.2024.1080p.mkv")).title).toBe("Harbor Lights 2024");
  });
});

describe("folderFor", () => {
  it("puts the picked folder's name in front when the path doesn't have it", () => {
    expect(folderFor("Season 1/ep.mkv", "Hometown")).toBe("Hometown/Season 1");
    expect(folderFor("ep.mkv", "Hometown")).toBe("Hometown");
    expect(folderFor("Hometown/Season 1/ep.mkv", "Hometown")).toBe("Hometown/Season 1");
  });
});

describe("railItems", () => {
  it("caps anything outside a series at 20, the playing one first", () => {
    const many = Array.from({ length: 2000 }, (_, i) => at(`v${String(i)}`, `Clip ${String(i)}.mp4`));
    const first = many[0];
    if (!first) throw new Error("fixture");
    const rail = railItems(many, first);
    expect(rail.length).toBe(20);
    expect(rail[0]?.id).toBe("v0");
  });

  it("shows a whole show in episode order", () => {
    const show = [at("e3", "Show.S01E03.mkv"), at("e1", "Show.S01E01.mkv"), at("e2", "Show.S01E02.mkv")];
    const e2 = show[2];
    if (!e2) throw new Error("fixture");
    expect(railItems(show, e2).map((i) => i.id)).toEqual(["e1", "e2", "e3"]);
  });
});

describe("showsOf (Media Home's Shows)", () => {
  const watched = (item: MediaItem, lastPlayedAt: string): MediaItem => ({ ...item, progress: { positionS: 0, watched: true, lastPlayedAt } });

  it("one card per show with two or more episodes, opening the first not watched", () => {
    const items = [
      at("h3", "Night.Harbor.S01E03.mkv"),
      watched(at("h1", "Night.Harbor.S01E01.mkv"), "2026-11-01T00:00:00Z"),
      at("h2", "Night.Harbor.S01E02.mkv"),
      at("solo", "Lone.Show.S01E01.mkv"),
      at("film", "Holiday 1920x1080.mp4"),
      at("yt", "https://www.youtube.com/watch?v=x", "embed"),
    ];
    const shows = showsOf(items);
    expect(shows.map((s) => s.show)).toEqual(["Night Harbor"]);
    expect(shows[0]?.episodes.map((i) => i.id)).toEqual(["h1", "h2", "h3"]);
    expect(shows[0]?.next.id).toBe("h2");
    expect(shows[0]?.watched).toBe(1);
  });

  it("goes on after the furthest watched, though earlier ones were never marked", () => {
    const shows = showsOf([
      at("s1e1", "Show.S01E01.mkv"),
      at("s1e2", "Show.S01E02.mkv"),
      watched(at("s2e1", "Show.S02E01.mkv"), "2026-11-03T00:00:00Z"),
      at("s2e2", "Show.S02E02.mkv"),
    ]);
    expect(shows[0]?.next.id).toBe("s2e2");
  });

  it("the last one watched but earlier gaps: the first not watched", () => {
    const shows = showsOf([at("a1", "Show.S01E01.mkv"), watched(at("a2", "Show.S01E02.mkv"), "2026-11-03T00:00:00Z")]);
    expect(shows[0]?.next.id).toBe("a1");
  });

  it("all watched: opens the first again", () => {
    const shows = showsOf([watched(at("a2", "Show.S01E02.mkv"), "2026-11-02T00:00:00Z"), watched(at("a1", "Show.S01E01.mkv"), "2026-11-01T00:00:00Z")]);
    expect(shows[0]?.next.id).toBe("a1");
  });

  it("the show played most recently comes first", () => {
    const shows = showsOf([
      at("a1", "Alpha.S01E01.mkv"),
      at("a2", "Alpha.S01E02.mkv"),
      watched(at("b1", "Beta.S01E01.mkv"), "2026-11-05T00:00:00Z"),
      at("b2", "Beta.S01E02.mkv"),
    ]);
    expect(shows.map((s) => s.show)).toEqual(["Beta", "Alpha"]);
  });
});

describe("folderGroups (the Videos tab's folders)", () => {
  it("keeps a folder's videos together, in episode order", () => {
    const items = [
      at("b2", "Beyond.Time.S01E45.mkv", "local", "Videos/AX beyond time"),
      at("a2", "Good.Day.S01E18.mkv", "local", "Videos/AX a good day"),
      at("film", "Holiday.mp4"),
      at("b1", "Beyond.Time.S01E44.mkv", "local", "Videos/AX beyond time"),
      at("a1", "Good.Day.S01E17.mkv", "local", "Videos/AX a good day"),
      at("yt", "https://youtu.be/abc", "embed"),
    ];
    const groups = folderGroups(items);
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ["AX beyond time", ["b1", "b2"]],
      ["AX a good day", ["a1", "a2"]],
      [LOOSE_LABEL, ["film", "yt"]],
    ]);
  });

  it("leaves a show's only loose episode on the loose shelf", () => {
    const groups = folderGroups([at("one", "Lone.Show.S01E01.mkv"), at("film", "Holiday.mp4"), at("other", "Another.S02E03.mkv")]);
    expect(groups.map((g) => [g.key, g.label, g.items.map((i) => i.id)])).toEqual([["", LOOSE_LABEL, ["film", "other", "one"]]]);
  });

  it("shelves loose episodes with their show, and films before episodes in a mixed folder", () => {
    const groups = folderGroups([at("e2", "Show.S01E02.mkv"), at("e1", "Show.S01E01.mkv"), at("m", "Clips/Show.S01E01.mkv", "local", "Clips"), at("f", "Clips/trailer 10.mp4", "local", "Clips"), at("f2", "Clips/trailer 9.mp4", "local", "Clips")]);
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ["Show", ["e1", "e2"]],
      ["Clips", ["f2", "f", "m"]],
    ]);
  });

  it("names a shelf from its folder", () => {
    expect(folderLabel("Videos/Solo Leveling S02 1080p Dual Audio BDRip 10 bits DD+ x265-EMBER")).toBe("Solo Leveling S02");
    expect(folderLabel("Hometown/Season 1")).toBe("Hometown · Season 1");
    expect(folderLabel("Videos")).toBe("Videos");
    expect(folderLabel("Night.Harbor.2021")).toBe("Night Harbor 2021");
  });
});
