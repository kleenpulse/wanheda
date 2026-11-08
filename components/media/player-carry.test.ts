import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CARRY_CLAIM_MS, usePlayer } from "./player-store";

// Picture in picture across items (V65): a player that goes while in PiP starts a carry; the next
// player claims it, else the window is closed after CARRY_CLAIM_MS. Never left frozen.

const exit = vi.fn(() => Promise.resolve());

beforeEach(() => {
  vi.useFakeTimers();
  exit.mockClear();
  vi.stubGlobal("document", { pictureInPictureElement: {}, exitPictureInPicture: exit, fullscreenElement: null });
  usePlayer.setState({ carryPip: 0, root: null });
  vi.spyOn(usePlayer.getState(), "notify").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("picture-in-picture carry", () => {
  it("is claimed by the next player: the window stays", () => {
    usePlayer.getState().startCarry();
    expect(usePlayer.getState().carryPip).toBeGreaterThan(0);
    expect(usePlayer.getState().claimCarry()).toBe(true);
    vi.advanceTimersByTime(CARRY_CLAIM_MS + 10);
    expect(exit).not.toHaveBeenCalled();
    expect(usePlayer.getState().carryPip).toBe(0);
  });

  it("closes the window when nothing claims it (an embed, a file not here)", () => {
    usePlayer.getState().startCarry();
    vi.advanceTimersByTime(CARRY_CLAIM_MS + 10);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(usePlayer.getState().carryPip).toBe(0);
    expect(usePlayer.getState().claimCarry()).toBe(false);
  });

  it("has nothing to claim when no player went in picture in picture", () => {
    expect(usePlayer.getState().claimCarry()).toBe(false);
  });
});

describe("register", () => {
  it("records the item its element plays, so a frame never shows another item's player", () => {
    const el = {} as HTMLVideoElement;
    usePlayer.getState().register(el, "Episode 1", "item-1");
    expect(usePlayer.getState().itemId).toBe("item-1");
    usePlayer.getState().unregister(el);
    expect(usePlayer.getState().itemId).toBeNull();
  });
});
