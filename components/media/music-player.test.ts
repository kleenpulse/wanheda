import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "@/lib/media/library";

// The player store over a fake engine whose module loads only when the test
// lets it: what a press does while the engine is still loading.

const play = vi.fn();
let release: () => void = () => undefined;
const gate = new Promise<void>((resolve) => {
  release = resolve;
});

vi.mock("@/lib/media/music-engine", async () => {
  await gate;
  class PlayError extends Error {}
  class MusicEngine {
    play = play;
    pause = vi.fn();
    resume = vi.fn();
    close = vi.fn();
    duck = vi.fn();
    setVolume = vi.fn();
    replanNext = vi.fn();
    position = () => null;
  }
  return { MusicEngine, PlayError, openFile: vi.fn(), openTone: vi.fn() };
});
vi.mock("./music-library", () => ({ musicFile: vi.fn(), FolderAccessError: class extends Error {} }));
vi.mock("@/components/ui/toaster", () => ({ toast: vi.fn() }));

const track = (n: number): Track => ({
  path: `tone:A/0${String(n)} T${String(n)}`,
  size: 0,
  lastModified: 0,
  title: `T${String(n)}`,
  artist: "A",
  album: "A",
  albumArtist: "A",
  genre: null,
  year: null,
  trackNo: n,
  discNo: null,
  durationS: 60,
  coverKey: null,
  folder: "",
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("music player store: a press while the engine loads", () => {
  beforeEach(() => {
    play.mockClear();
  });

  it("a pause before the engine arrives wins: nothing plays under a paused player", async () => {
    const { useMusicPlayer } = await import("./music-player");
    useMusicPlayer.getState().playList([track(1), track(2)], 0);
    useMusicPlayer.getState().pause();
    release();
    await flush();
    await flush();
    expect(play).not.toHaveBeenCalled();
    expect(useMusicPlayer.getState().status).toBe("paused");
  });

  it("once loaded, a play goes through", async () => {
    const { useMusicPlayer } = await import("./music-player");
    useMusicPlayer.getState().playList([track(1), track(2)], 1);
    await flush();
    expect(play).toHaveBeenCalledWith(1, 0);
  });
});
