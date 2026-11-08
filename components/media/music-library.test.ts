import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "@/lib/media/library";
import type { MusicRequest, MusicResponse } from "@/lib/media/music-protocol";

// The store with a fake device index and a stub worker: what a scan writes, and
// what the next scan is told to leave alone.

const table = <T>(rows: T[] = []) => ({
  rows,
  toArray: vi.fn(() => Promise.resolve([...rows])),
  bulkPut: vi.fn((r: T[]) => {
    rows.push(...r);
    return Promise.resolve();
  }),
  bulkDelete: vi.fn(() => Promise.resolve()),
  clear: vi.fn(() => {
    rows.length = 0;
    return Promise.resolve();
  }),
  get: vi.fn(() => Promise.resolve(rows[0])),
  put: vi.fn(() => Promise.resolve()),
});

const dir = { name: "Music", kind: "directory", queryPermission: () => Promise.resolve("granted"), isSameEntry: () => Promise.resolve(true) };
let fake: ReturnType<typeof makeDb>;
function makeDb() {
  const d = {
    tracks: table<Track>(),
    skipped: table<{ path: string; size: number; lastModified: number }>(),
    folders: table([{ key: "music", handle: dir, name: "Music" }]),
    transaction: (_m: string, _t: unknown, fn: () => Promise<void>) => fn(),
  };
  return d;
}

vi.mock("@/lib/media/local", () => ({ db: () => Promise.resolve(fake) }));

const posted: MusicRequest[] = [];
let toStore: ((e: { data: MusicResponse }) => void) | null = null;
class StubWorker {
  set onmessage(fn: (e: { data: MusicResponse }) => void) {
    toStore = fn;
  }
  onerror = null;
  postMessage(m: MusicRequest) {
    posted.push(m);
  }
  terminate() {}
}
vi.stubGlobal("Worker", StubWorker);

const flush = () => new Promise((r) => setTimeout(r, 0));
const lastScan = () => {
  const m = posted.at(-1);
  if (m?.type !== "scan") throw new Error("no scan posted");
  return m;
};
const reply = (m: MusicResponse) => {
  toStore?.({ data: m });
};

async function freshStore() {
  vi.resetModules();
  return (await import("./music-library")).useMusicLibrary;
}

beforeEach(() => {
  fake = makeDb();
  posted.length = 0;
  toStore = null;
});

describe("useMusicLibrary", () => {
  it("remembers a skipped file so the next scan doesn't read it again", async () => {
    const lib = await freshStore();
    lib.getState().load(false);
    await vi.waitFor(() => {
      expect(posted).toHaveLength(1);
    });
    expect(lastScan().skipped).toEqual([]);
    reply({ type: "done", id: lastScan().id, removed: [], unreadable: [], parsed: 0, kept: 0, bad: 1, skipped: [["junk.mp3", 5, 5]] });
    await flush();
    expect(fake.skipped.rows).toEqual([{ path: "junk.mp3", size: 5, lastModified: 5 }]);

    await lib.getState().rescan();
    expect(lastScan().skipped).toEqual([["junk.mp3", 5, 5]]);

    // A reload reads the list back from the device.
    const again = await freshStore();
    again.getState().load(false);
    await vi.waitFor(() => {
      expect(posted).toHaveLength(3);
    });
    expect(lastScan().skipped).toEqual([["junk.mp3", 5, 5]]);
  });

  it("keeps a folder-input scan in this tab: nothing is written to the device", async () => {
    fake.folders.rows.length = 0;
    const lib = await freshStore();
    lib.getState().load(false);
    await flush();
    const file = { name: "a.mp3", webkitRelativePath: "Music/a.mp3", size: 1, lastModified: 1 } as File;
    lib.getState().pickFiles([file]);
    const { id } = lastScan();
    const track = { path: "a.mp3", size: 1, lastModified: 1 } as Track;
    reply({ type: "batch", id, tracks: [track] });
    reply({ type: "done", id, removed: [], unreadable: [], parsed: 1, kept: 0, bad: 1, skipped: [["b.mp3", 2, 2]] });
    await flush();
    expect(lib.getState().tracks).toEqual([track]);
    expect(fake.tracks.bulkPut).not.toHaveBeenCalled();
    expect(fake.skipped.bulkPut).not.toHaveBeenCalled();
  });

  it("drops a track that changed and no longer parses", async () => {
    const old = { path: "x.mp3", size: 1, lastModified: 1 } as Track;
    fake.tracks.rows.push(old);
    const lib = await freshStore();
    lib.getState().load(false);
    await vi.waitFor(() => {
      expect(posted).toHaveLength(1);
    });
    reply({ type: "done", id: lastScan().id, removed: [], unreadable: [], parsed: 0, kept: 0, bad: 1, skipped: [["x.mp3", 2, 2]] });
    await flush();
    expect(lib.getState().tracks).toEqual([]);
    expect(fake.tracks.bulkDelete).toHaveBeenCalledWith(["x.mp3"]);
  });
});
