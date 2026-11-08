import { describe, expect, it, vi } from "vitest";
import { createVideoStore, type VideoLike } from "./video-store";

class FakeVideo extends EventTarget implements VideoLike {
  paused = true;
  ended = false;
  duration = Number.NaN;
  currentTime = 0;
  volume = 1;
  muted = false;
  playbackRate = 1;
  videoWidth = 0;
  videoHeight = 0;
  readyState = 4;
  seeking = false;
  fire(type: string) {
    this.dispatchEvent(new Event(type));
  }
}

describe("createVideoStore", () => {
  it("hands back the same snapshot until a field really changes (no render loop)", () => {
    const el = new FakeVideo();
    const store = createVideoStore(el, () => false);
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);
    const listener = vi.fn();
    store.subscribe(listener);
    // NaN duration both times: still the same snapshot.
    el.fire("durationchange");
    expect(store.getSnapshot()).toBe(first);
    expect(listener).not.toHaveBeenCalled();
  });

  it("commits once a whole second, not on every time update", () => {
    const el = new FakeVideo();
    const store = createVideoStore(el, () => false);
    const listener = vi.fn();
    store.subscribe(listener);
    el.paused = false;
    el.fire("play");
    expect(listener).toHaveBeenCalledTimes(1);
    for (const t of [0.25, 0.5, 0.75]) {
      el.currentTime = t;
      el.fire("timeupdate");
    }
    expect(listener).toHaveBeenCalledTimes(1);
    el.currentTime = 1.01;
    el.fire("timeupdate");
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().second).toBe(1);
  });

  it("reports waiting only while it should be playing", () => {
    const el = new FakeVideo();
    const store = createVideoStore(el, () => false);
    store.subscribe(() => undefined);
    el.readyState = 2;
    el.fire("waiting");
    expect(store.getSnapshot().waiting).toBe(false);
    el.paused = false;
    el.fire("play");
    expect(store.getSnapshot().waiting).toBe(true);
    el.readyState = 4;
    el.fire("playing");
    expect(store.getSnapshot().waiting).toBe(false);
  });

  it("stops listening when the last reader leaves", () => {
    const el = new FakeVideo();
    const remove = vi.spyOn(el, "removeEventListener");
    const store = createVideoStore(el, () => false);
    const a = store.subscribe(() => undefined);
    const b = store.subscribe(() => undefined);
    a();
    expect(remove).not.toHaveBeenCalled();
    b();
    expect(remove).toHaveBeenCalled();
  });
});
