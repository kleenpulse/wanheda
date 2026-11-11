import { describe, expect, it } from "vitest";
import { foldText, readEntry } from "./entry";

const kindOf = (s: string) => readEntry(s).kind;

describe("readEntry (Media's one field)", () => {
  it("reads links, with or without a scheme", () => {
    for (const s of ["https://youtu.be/dQw4w9WgXcQ", "youtu.be/dQw4w9WgXcQ", "www.youtube.com/watch?v=dQw4w9WgXcQ", "  https://example.com/films/a.mp4  ", "example.com/a.mp4", "http://localhost:8080/a.mkv", "localhost:8080/a.mkv", "10.0.0.5/films/x.mp4", "www.example.com", "example.com/watch?id=3", "https://example.com/a b.mp4", "https://example.com/stream"]) {
      expect([s, kindOf(s)]).toEqual([s, "link"]);
    }
    const yt = readEntry("youtu.be/dQw4w9WgXcQ");
    expect(yt.kind === "link" && yt.link.kind === "embed" && yt.link.provider).toBe("youtube");
    const file = readEntry("example.com/song.mp3");
    expect(file.kind === "link" && file.link.mediaKind).toBe("audio");
  });

  it("reads words, titles and file names as a search, never as a link", () => {
    for (const s of ["naruto", "night harbor", "Night.Harbor.S01E03.mkv", "film.mp4", "night.harbor", "Re:Zero", "ac/dc", "s01e05", "1080p x264", "what is youtube.com", "Night.Harbor/Season", "movies.old/film", "v1.2/notes", "a.b/c", "me@example.com", "example.com/stream"]) {
      expect([s, kindOf(s)]).toEqual([s, "search"]);
    }
    expect(readEntry("  Pokémon   Journeys ")).toEqual({ kind: "search", words: ["pokemon", "journeys"], from: "words" });
  });

  it("looks a pasted path up by its file name", () => {
    const want = { kind: "search", words: ["night", "harbor", "s01e03", "1080p"], from: "file" };
    expect(readEntry("C:\\Videos\\Shows\\Night.Harbor.S01E03.1080p.mkv")).toEqual(want);
    expect(readEntry('"C:\\Videos\\Shows\\Night.Harbor.S01E03.1080p.mkv"')).toEqual(want);
    expect(readEntry("/home/me/Night Harbor S01E03 1080p.mkv")).toEqual(want);
    expect(readEntry("file:///C:/Videos/Night%20Harbor.S01E03.1080p.mkv")).toEqual(want);
    expect(readEntry("\\\\nas\\films\\Night_Harbor_S01E03_1080p.mkv")).toEqual(want);
  });

  it("names a link that can't play, and reads nothing as empty", () => {
    expect(readEntry("ftp://example.com/a.mp4")).toEqual({ kind: "bad-link", reason: "Only http and https links can be played." });
    expect(kindOf("https://user:pw@example.com/a.mp4")).toBe("bad-link");
    expect(kindOf("")).toBe("empty");
    expect(kindOf("   ")).toBe("empty");
    expect(kindOf('""')).toBe("empty");
    expect(kindOf("C:\\")).toBe("empty");
  });
});

describe("foldText", () => {
  it("drops accents and case", () => {
    expect(foldText("Amélie À LA Carte")).toBe("amelie a la carte");
  });
});
