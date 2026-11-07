import { describe, expect, it, vi } from "vitest";
import { SessionArbiter, type SessionClaim, type SessionLike, type SessionOwnerId } from "./session-owner";

function fake() {
  const handlers = new Map<MediaSessionAction, MediaSessionActionHandler | null>();
  const s: SessionLike & { handlers: typeof handlers } = {
    metadata: null,
    playbackState: "none",
    handlers,
    setActionHandler: (a, h) => {
      handlers.set(a, h);
    },
  };
  return s;
}

function claim(id: SessionOwnerId, title: string = id) {
  const play = vi.fn();
  const pause = vi.fn();
  const c: SessionClaim = { id, metadata: { title, artist: "", album: "" }, handlers: { play }, pause };
  return { c, play, pause };
}

function setup() {
  const s = fake();
  const arb = new SessionArbiter(
    () => s,
    (m) => ({ title: m.title }) as unknown as MediaMetadata,
  );
  const title = () => (s.metadata as unknown as { title: string } | null)?.title ?? null;
  return { s, arb, title };
}

describe("SessionArbiter (V60)", () => {
  it("the last started owns the keys and the metadata", () => {
    const { s, arb, title } = setup();
    const speech = claim("speech");
    const video = claim("video");
    arb.claim(speech.c, true);
    arb.setState("speech", "playing");
    arb.claim(video.c, true);
    expect(arb.owner).toBe("video");
    expect(title()).toBe("video");
    s.handlers.get("play")?.({ action: "play" });
    expect(video.play).toHaveBeenCalledOnce();
    expect(speech.play).not.toHaveBeenCalled();
  });

  it("starting one pauses the others that are playing (pause mode)", () => {
    const { arb } = setup();
    const speech = claim("speech");
    const video = claim("video");
    arb.claim(speech.c, true);
    arb.setState("speech", "playing");
    arb.claim(video.c, true);
    expect(speech.pause).toHaveBeenCalledOnce();
    expect(video.pause).not.toHaveBeenCalled();
  });

  it("a refresh keeps its place and pauses no one", () => {
    const { arb } = setup();
    const speech = claim("speech");
    const video = claim("video");
    arb.claim(speech.c, true);
    arb.claim(video.c, true);
    arb.setState("video", "playing");
    arb.claim(claim("speech", "next chapter").c, false);
    expect(arb.owner).toBe("video");
    expect(video.pause).not.toHaveBeenCalled();
  });

  it("releasing the owner hands the keys back to the newest claim still held", () => {
    const { s, arb, title } = setup();
    arb.claim(claim("speech").c, true);
    arb.setState("speech", "paused");
    arb.claim(claim("video").c, true);
    arb.release("video");
    expect(arb.owner).toBe("speech");
    expect(title()).toBe("speech");
    expect(s.playbackState).toBe("paused");
    arb.release("speech");
    expect(s.metadata).toBeNull();
    expect(s.playbackState).toBe("none");
    expect(s.handlers.get("play")).toBeNull();
  });

  it("a new claim that isn't playing yet waits below a playing owner", () => {
    const { arb, title } = setup();
    const video = claim("video");
    arb.claim(video.c, true);
    arb.setState("video", "playing");
    arb.claim(claim("speech").c, false);
    expect(arb.owner).toBe("video");
    expect(title()).toBe("video");
    expect(video.pause).not.toHaveBeenCalled();
    arb.claim(claim("speech").c, true);
    expect(arb.owner).toBe("speech");
    expect(video.pause).toHaveBeenCalledOnce();
  });

  it("only the owner's state reaches the OS", () => {
    const { s, arb } = setup();
    arb.claim(claim("speech").c, true);
    arb.claim(claim("video").c, true);
    arb.setState("video", "playing");
    arb.setState("speech", "paused");
    expect(s.playbackState).toBe("playing");
  });
});
