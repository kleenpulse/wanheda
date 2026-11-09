import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { fileUrl, type Root } from "./files";
import { listRoot, resolveInRoot, serveFile } from "./files-io";

const id = "0123456789abcdef0123456789abcdef";
const app = "http://localhost:4123";
let base = "";
let root: Root;

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), "wanheda-files-"));
  const music = join(base, "Music");
  mkdirSync(join(music, "Album"), { recursive: true });
  mkdirSync(join(music, ".hidden"), { recursive: true });
  mkdirSync(join(base, "Secret"), { recursive: true });
  writeFileSync(join(music, "Album", "01 Song.mp3"), Buffer.from("0123456789"));
  writeFileSync(join(music, "notes.txt"), "x");
  writeFileSync(join(music, ".hidden", "skip.mp3"), "x");
  writeFileSync(join(base, "Secret", "secret.mp3"), "secret");
  writeFileSync(join(base, "Music2.mp3"), "outside");
  // A junction (no admin needed on Windows) and a file symlink, both pointing out of the root.
  symlinkSync(join(base, "Secret"), join(music, "escape"), "junction");
  try {
    symlinkSync(join(base, "Secret", "secret.mp3"), join(music, "link.mp3"), "file");
  } catch {
    // File symlinks need a privilege on Windows without developer mode; the junction covers the case.
  }
  root = { id, kind: "music", path: music, name: "Music" };
});

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

describe("resolveInRoot", () => {
  test("a file inside the root", async () => {
    expect(await resolveInRoot(root.path, ["Album", "01 Song.mp3"])).toMatchObject({ size: 10 });
  });

  test("nothing outside it: a junction or link out, the root itself, a folder, a missing file", async () => {
    expect(await resolveInRoot(root.path, ["escape", "secret.mp3"])).toBeNull();
    expect(await resolveInRoot(root.path, ["link.mp3"])).toBeNull();
    expect(await resolveInRoot(root.path, ["Album"])).toBeNull();
    expect(await resolveInRoot(root.path, ["nope.mp3"])).toBeNull();
    expect(await resolveInRoot(root.path, [".."])).toBeNull();
  });

  test("case doesn't matter on Windows", async () => {
    if (process.platform !== "win32") return;
    expect(await resolveInRoot(root.path.toUpperCase(), ["album", "01 SONG.MP3"])).toMatchObject({ size: 10 });
  });
});

describe("serveFile", () => {
  const get = (url: string, headers: Record<string, string> = {}) => serveFile(new Request(url, { headers }), [root], app);

  test("the whole file, with CORS for the app only", async () => {
    const r = await get(fileUrl(id, "Album/01 Song.mp3"));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("audio/mpeg");
    expect(r.headers.get("accept-ranges")).toBe("bytes");
    expect(r.headers.get("access-control-allow-origin")).toBe(app);
    expect(await r.text()).toBe("0123456789");
  });

  test("a range, for seeking", async () => {
    const r = await get(fileUrl(id, "Album/01 Song.mp3"), { range: "bytes=2-5" });
    expect(r.status).toBe(206);
    expect(r.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(r.headers.get("content-length")).toBe("4");
    expect(await r.text()).toBe("2345");
    const tail = await get(fileUrl(id, "Album/01 Song.mp3"), { range: "bytes=-3" });
    expect(await tail.text()).toBe("789");
    expect((await get(fileUrl(id, "Album/01 Song.mp3"), { range: "bytes=10-" })).status).toBe(416);
  });

  test("refused: another origin, an unknown root, a way out, a write", async () => {
    expect((await get(fileUrl(id, "Album/01 Song.mp3"), { origin: "https://www.youtube-nocookie.com" })).status).toBe(404);
    expect((await get(fileUrl("f".repeat(32), "Album/01 Song.mp3"))).status).toBe(404);
    expect((await get(fileUrl(id, "escape/secret.mp3"))).status).toBe(404);
    expect((await get(`wanheda-file://${id}/..%2FMusic2.mp3`)).status).toBe(404);
    expect((await serveFile(new Request(fileUrl(id, "Album/01 Song.mp3"), { method: "POST", body: "x" }), [root], app)).status).toBe(405);
  });
});

describe("listRoot", () => {
  test("media files only, dot-folders skipped, links never followed", async () => {
    const { files, complete } = await listRoot(root);
    expect(files.map((f) => f.path)).toEqual(["Album/01 Song.mp3"]);
    expect(files[0]).toMatchObject({ size: 10 });
    expect(complete).toBe(true);
  });

  test("a missing root lists nothing and isn't complete", async () => {
    expect(await listRoot({ ...root, path: join(base, "gone") })).toEqual({ files: [], complete: false });
  });
});
