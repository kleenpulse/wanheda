import { describe, expect, it } from "vitest";
import { FOLDER_MAX, isVideoName, orderFolderVideos, videosInFiles, videosInFolder, type FolderVideo } from "./local";

const file = (name: string, rel = "") => Object.assign(new File(["x"], name), { webkitRelativePath: rel });

type Entry = { kind: "file"; name: string; getFile: () => Promise<File> } | { kind: "directory"; name: string; values: () => AsyncIterable<Entry> };

const dir = (name: string, children: Entry[]): Entry => ({
  kind: "directory",
  name,
  values: async function* () {
    await Promise.resolve();
    yield* children;
  },
});
/** A folder the browser refuses to list (Windows' System Volume Information, say). */
const locked = (name: string): Entry => ({
  kind: "directory",
  name,
  values: async function* () {
    await Promise.resolve();
    yield* [] as Entry[];
    throw new DOMException("denied", "NotAllowedError");
  },
});
const leaf = (name: string, ok = true): Entry => ({
  kind: "file",
  name,
  getFile: () => (ok ? Promise.resolve(file(name)) : Promise.reject(new DOMException("gone", "NotFoundError"))),
});

describe("video folder pick", () => {
  it("knows a video by its extension, any case", () => {
    expect(isVideoName("Ep 1.MKV")).toBe(true);
    expect(isVideoName("clip.mp4")).toBe(true);
    expect(isVideoName("song.mp3")).toBe(false);
    expect(isVideoName("notes.txt")).toBe(false);
    expect(isVideoName("mkv")).toBe(false);
  });

  it("orders by name with numbers counted, and caps the count", () => {
    const v = (path: string): FolderVideo => ({ path, file: file(path), handle: null });
    expect(orderFolderVideos([v("Ep 10.mp4"), v("ep 2.mp4"), v("Ep 1.mp4")]).map((x) => x.path)).toEqual(["Ep 1.mp4", "ep 2.mp4", "Ep 10.mp4"]);
    expect(orderFolderVideos(Array.from({ length: FOLDER_MAX + 5 }, (_, i) => v(`${String(i)}.mp4`)))).toHaveLength(FOLDER_MAX);
  });

  it("walks sub-folders, skips hidden ones, non-videos and files that won't open", async () => {
    const root = dir("Shows", [
      leaf("b.mp4"),
      leaf("cover.jpg"),
      leaf("gone.mkv", false),
      dir("Season 1", [leaf("Ep 2.mkv"), leaf("Ep 10.mkv"), leaf("theme.mp3")]),
      dir(".trash", [leaf("old.mp4")]),
    ]);
    const found = await videosInFolder(root as unknown as FileSystemDirectoryHandle);
    expect(found.map((v) => v.path)).toEqual(["b.mp4", "Season 1/Ep 2.mkv", "Season 1/Ep 10.mkv"]);
    expect(found.every((v) => v.handle !== null)).toBe(true);
  });

  it("skips a sub-folder it can't list and keeps the rest", async () => {
    const root = dir("Shows", [leaf("a.mp4"), locked("System Volume Information"), dir("S1", [leaf("b.mp4")])]);
    const found = await videosInFolder(root as unknown as FileSystemDirectoryHandle);
    expect(found.map((v) => v.path)).toEqual(["a.mp4", "S1/b.mp4"]);
  });

  it("rejects when the picked folder itself can't be listed (the caller says so)", async () => {
    await expect(videosInFolder(locked("Drive") as unknown as FileSystemDirectoryHandle)).rejects.toThrow("denied");
  });

  it("takes a folder input's videos the same way, without handles", () => {
    const found = videosInFiles([
      file("Ep 10.mp4", "Shows/Ep 10.mp4"),
      file("Ep 2.mp4", "Shows/Ep 2.mp4"),
      file("song.flac", "Shows/song.flac"),
      file("old.mp4", "Shows/.trash/old.mp4"),
      // The picked folder itself may be hidden; only folders under it are skipped.
      file("x.webm", ".hidden-pick/x.webm"),
    ]);
    expect(found.map((v) => v.path)).toEqual([".hidden-pick/x.webm", "Shows/Ep 2.mp4", "Shows/Ep 10.mp4"]);
    expect(found.every((v) => v.handle === null)).toBe(true);
  });
});
