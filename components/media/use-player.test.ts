import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SOUND_FADE } from "@/lib/motion";
import { elementFader } from "./use-player";

// The video's fade when another sound takes over (V60, B25 review): a fake
// element, fake timers and a fake clock, so a fade runs in steps we choose.

function fakeVideo(volume = 1) {
  const el = {
    volume,
    paused: false,
    ended: false,
    pause: vi.fn(() => {
      el.paused = true;
    }),
    play: vi.fn(() => {
      el.paused = false;
      return Promise.resolve();
    }),
  };
  return el;
}

const ms = (s: number) => Math.round(s * 1000);

describe("elementFader (V60)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fades out, pauses, and puts the owner's level back at once", () => {
    const el = fakeVideo(0.8);
    const f = elementFader(el as unknown as HTMLMediaElement, () => 0.8);
    f.out();
    expect(f.fadingOut()).toBe(true);
    vi.advanceTimersByTime(ms(SOUND_FADE.out / 2));
    expect(el.volume).toBeGreaterThan(0);
    expect(el.volume).toBeLessThan(0.8);
    expect(el.paused).toBe(false);
    vi.advanceTimersByTime(ms(SOUND_FADE.out));
    expect(el.pause).toHaveBeenCalledOnce();
    expect(el.volume).toBe(0.8);
  });

  it("a resume mid fade-out turns it back up and never pauses", () => {
    const el = fakeVideo(1);
    const f = elementFader(el as unknown as HTMLMediaElement, () => 1);
    f.out();
    vi.advanceTimersByTime(ms(SOUND_FADE.out / 3));
    f.in();
    vi.advanceTimersByTime(ms(SOUND_FADE.in + SOUND_FADE.out));
    expect(el.pause).not.toHaveBeenCalled();
    expect(el.volume).toBe(1);
  });

  it("plays again from silence and fades in to the owner's level", async () => {
    const el = fakeVideo(1);
    const f = elementFader(el as unknown as HTMLMediaElement, () => 1);
    f.out();
    vi.advanceTimersByTime(ms(SOUND_FADE.out) + 20);
    f.in();
    expect(el.volume).toBe(0);
    await Promise.resolve();
    vi.advanceTimersByTime(ms(SOUND_FADE.in / 2));
    expect(el.volume).toBeGreaterThan(0);
    expect(el.volume).toBeLessThan(1);
    vi.advanceTimersByTime(ms(SOUND_FADE.in));
    expect(el.volume).toBe(1);
  });

  it("a fade-out during a fade-in leaves the owner's level, not the partial one", async () => {
    const el = fakeVideo(1);
    const f = elementFader(el as unknown as HTMLMediaElement, () => 1);
    f.out();
    vi.advanceTimersByTime(ms(SOUND_FADE.out) + 20);
    f.in();
    await Promise.resolve();
    vi.advanceTimersByTime(200);
    f.out();
    vi.advanceTimersByTime(ms(SOUND_FADE.out) + 20);
    expect(el.paused).toBe(true);
    expect(el.volume).toBe(1);
  });

  it("dispose mid fade puts the owner's level back", () => {
    const el = fakeVideo(1);
    const f = elementFader(el as unknown as HTMLMediaElement, () => 1);
    f.out();
    vi.advanceTimersByTime(ms(SOUND_FADE.out / 2));
    f.dispose();
    expect(el.volume).toBe(1);
    vi.advanceTimersByTime(ms(SOUND_FADE.out));
    expect(el.pause).not.toHaveBeenCalled();
  });
});
