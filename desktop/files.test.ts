import { describe, expect, test } from "vitest";
import { contentType, fileUrl, isInside, isRootId, isUncPath, newRootId, parseFileUrl, parseRange, parseRoots } from "./files";

const id = "0123456789abcdef0123456789abcdef";

describe("roots", () => {
  test("new ids are 128 random bits in hex", () => {
    const a = newRootId();
    expect(isRootId(a)).toBe(true);
    expect(a).not.toBe(newRootId());
    expect(isRootId("../etc")).toBe(false);
  });

  test("roots.json: bad entries are dropped, not the file", () => {
    const good = { id, kind: "music", path: "D:\\Music", name: "Music" };
    expect(parseRoots(JSON.stringify([good, { ...good, id: "x" }, { ...good, id: "f".repeat(32), kind: "docs" }, good, null]))).toEqual([good]);
    expect(parseRoots("{broken")).toEqual([]);
    expect(parseRoots(null)).toEqual([]);
    expect(parseRoots('{"a":1}')).toEqual([]);
  });
});

describe("parseFileUrl", () => {
  test("round trip with fileUrl, any characters in names", () => {
    const rel = "Albums/AC#DC 100%/01 Hells Bells?.mp3";
    expect(parseFileUrl(fileUrl(id, rel))).toEqual({ rootId: id, segments: ["Albums", "AC#DC 100%", "01 Hells Bells?.mp3"] });
    expect(parseFileUrl(fileUrl(id, "Música/ñ.flac"))?.segments).toEqual(["Música", "ñ.flac"]);
  });

  test("traversal and odd spellings are refused", () => {
    for (const bad of [
      `wanheda-file://${id}/a/../b.mp3`,
      `wanheda-file://${id}/a/%2e%2e/b.mp3`,
      `wanheda-file://${id}/%2E%2E/x`,
      `wanheda-file://${id}/./a.mp3`,
      `wanheda-file://${id}/a//b.mp3`,
      `wanheda-file://${id}/a%2Fb.mp3`,
      `wanheda-file://${id}/a%5Cb.mp3`,
      `wanheda-file://${id}/C%3A/Windows/win.ini`,
      `wanheda-file://${id}/a%00.mp3`,
      `wanheda-file://${id}/`,
      `wanheda-file://${id}`,
      `wanheda-file://${id}/a.mp3?x=1`,
      `wanheda-file://${id}/a.mp3#t`,
      `wanheda-file://user@${id}/a.mp3`,
      `wanheda-file://${id}:80/a.mp3`,
      `wanheda-file://not-an-id/a.mp3`,
      `file:///C:/Windows/win.ini`,
      `wanheda-file://${id}/%E0%A4%A.mp3`,
      "not a url",
    ]) {
      expect(parseFileUrl(bad), bad).toBeNull();
    }
  });

  test("the root id is read without case", () => {
    expect(parseFileUrl(`wanheda-file://${id.toUpperCase()}/a.mp3`)?.rootId).toBe(id);
  });
});

describe("isInside", () => {
  test("Windows: without case, on a separator boundary", () => {
    expect(isInside("D:\\Music", "d:\\music\\a.mp3", true)).toBe(true);
    expect(isInside("D:\\Music\\", "D:\\Music\\sub\\a.mp3", true)).toBe(true);
    expect(isInside("D:\\Music", "D:\\Music", true)).toBe(true);
    expect(isInside("D:\\Music", "D:\\Music2\\a.mp3", true)).toBe(false);
    expect(isInside("D:\\Music", "D:\\Other\\a.mp3", true)).toBe(false);
    expect(isInside("D:/Music", "D:\\Music\\a.mp3", true)).toBe(true);
  });

  test("POSIX: with case", () => {
    expect(isInside("/home/me/Music", "/home/me/Music/a.mp3", false)).toBe(true);
    expect(isInside("/home/me/Music", "/home/me/music/a.mp3", false)).toBe(false);
    expect(isInside("/home/me/Music", "/home/me/Music2/a.mp3", false)).toBe(false);
  });

  test("UNC and device paths are spotted", () => {
    expect(isUncPath("\\\\server\\share\\a.mp3")).toBe(true);
    expect(isUncPath("\\\\?\\C:\\a.mp3")).toBe(true);
    expect(isUncPath("//server/share")).toBe(true);
    expect(isUncPath("D:\\Music")).toBe(false);
  });
});

describe("parseRange", () => {
  test("one range, open-ended and suffix forms", () => {
    expect(parseRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=500-", 1000)).toEqual({ start: 500, end: 999 });
    expect(parseRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=-5000", 1000)).toEqual({ start: 0, end: 999 });
    expect(parseRange("bytes=900-5000", 1000)).toEqual({ start: 900, end: 999 });
  });

  test("none, several or malformed: the whole file", () => {
    expect(parseRange(null, 1000)).toBeNull();
    expect(parseRange("bytes=0-1,5-6", 1000)).toBeNull();
    expect(parseRange("items=0-1", 1000)).toBeNull();
    expect(parseRange("bytes=-", 1000)).toBeNull();
  });

  test("unsatisfiable", () => {
    expect(parseRange("bytes=1000-", 1000)).toBe("unsatisfiable");
    expect(parseRange("bytes=5-2", 1000)).toBe("unsatisfiable");
    expect(parseRange("bytes=-0", 1000)).toBe("unsatisfiable");
    expect(parseRange("bytes=0-", 0)).toBe("unsatisfiable");
  });
});

test("content types by extension", () => {
  expect(contentType("a.MP3")).toBe("audio/mpeg");
  expect(contentType("film.mkv")).toBe("video/x-matroska");
  expect(contentType("noext")).toBe("application/octet-stream");
});
