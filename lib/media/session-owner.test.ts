import { describe, expect, it, vi } from "vitest";
import { SessionArbiter, type SessionClaim, type SessionLike, type SessionOwnerId } from "./session-owner";
import { SOUND_MODES, type DuckLevel, type SoundMix, type SoundMode } from "./sound-mix";

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

describe("SessionArbiter: Sound modes (V60)", () => {
  function withMode(mode: SoundMode, level: DuckLevel = 35) {
    const s = fake();
    const mix: SoundMix = { mode, level };
    const arb = new SessionArbiter(
      () => s,
      (m) => ({ title: m.title }) as unknown as MediaMetadata,
      () => mix,
    );
    return { s, arb, mix };
  }
  function ducking(id: SessionOwnerId) {
    const c = claim(id);
    const duck = vi.fn();
    return { ...c, c: { ...c.c, duck }, duck };
  }

  for (const mode of SOUND_MODES) {
    it(`${mode}: video and music always pause each other`, () => {
      const { arb } = withMode(mode);
      const video = ducking("video");
      const music = ducking("music");
      arb.claim(video.c, true);
      arb.setState("video", "playing");
      arb.claim(music.c, true);
      expect(video.pause).toHaveBeenCalledOnce();
      expect(arb.owner).toBe("music");
    });

    it(`${mode}: speech over music takes the keys; stopping it hands them back`, () => {
      const { s, arb } = withMode(mode);
      const music = ducking("music");
      arb.claim(music.c, true);
      arb.setState("music", "playing");
      arb.claim(claim("speech").c, true);
      arb.setState("speech", "playing");
      expect(arb.owner).toBe("speech");
      expect(music.pause).toHaveBeenCalledTimes(mode === "pause" ? 1 : 0);
      if (mode === "pause") arb.setState("music", "paused");
      arb.release("speech");
      expect(arb.owner).toBe("music");
      expect(s.playbackState).toBe(mode === "pause" ? "paused" : "playing");
      s.handlers.get("play")?.({ action: "play" });
      expect(music.play).toHaveBeenCalledOnce();
    });
  }

  it("duck: music drops to the duck level while speech plays and comes back when it pauses or stops", () => {
    const { arb } = withMode("duck", 20);
    const music = ducking("music");
    arb.claim(music.c, true);
    arb.setState("music", "playing");
    expect(music.duck).not.toHaveBeenCalled();
    arb.claim(claim("speech").c, true);
    arb.setState("speech", "playing");
    expect(music.duck).toHaveBeenLastCalledWith(0.2);
    arb.setState("speech", "paused");
    expect(music.duck).toHaveBeenLastCalledWith(1);
    arb.setState("speech", "playing");
    arb.release("speech");
    expect(music.duck).toHaveBeenLastCalledWith(1);
    expect(music.duck).toHaveBeenCalledTimes(4);
  });

  it("duck: video ducks too, and music started under speech starts ducked", () => {
    const { arb } = withMode("duck");
    const video = ducking("video");
    arb.claim(claim("speech").c, true);
    arb.setState("speech", "playing");
    arb.claim(video.c, true);
    arb.setState("video", "playing");
    expect(arb.owner).toBe("video");
    expect(video.duck).toHaveBeenLastCalledWith(0.35);
  });

  it("pause and mix never duck", () => {
    for (const mode of ["pause", "mix"] as const) {
      const { arb } = withMode(mode);
      const music = ducking("music");
      arb.claim(music.c, true);
      arb.setState("music", "playing");
      arb.claim(claim("speech").c, true);
      arb.setState("speech", "playing");
      expect(music.duck).not.toHaveBeenCalled();
    }
  });

  it("a changed setting applies at once (refresh)", () => {
    const { arb, mix } = withMode("mix");
    const music = ducking("music");
    arb.claim(music.c, true);
    arb.setState("music", "playing");
    arb.claim(claim("speech").c, true);
    arb.setState("speech", "playing");
    mix.mode = "duck";
    arb.refresh();
    expect(music.duck).toHaveBeenLastCalledWith(0.35);
    mix.mode = "mix";
    arb.refresh();
    expect(music.duck).toHaveBeenLastCalledWith(1);
  });
});

describe("SessionArbiter: release lifts the duck (V60)", () => {
  it("a ducked owner that leaves gets its full level back, so its next play isn't stuck low", () => {
    const s = fake();
    const arb = new SessionArbiter(
      () => s,
      (m) => ({ title: m.title }) as unknown as MediaMetadata,
      () => ({ mode: "duck", level: 35 }),
    );
    const duck = vi.fn();
    arb.claim({ ...claim("music").c, duck }, true);
    arb.setState("music", "playing");
    arb.claim(claim("speech").c, true);
    arb.setState("speech", "playing");
    expect(duck).toHaveBeenLastCalledWith(0.35);
    arb.release("music");
    expect(duck).toHaveBeenLastCalledWith(1);
  });

  it("releasing an owner that was never ducked doesn't call duck", () => {
    const s = fake();
    const arb = new SessionArbiter(() => s, (m) => ({ title: m.title }) as unknown as MediaMetadata);
    const duck = vi.fn();
    arb.claim({ ...claim("music").c, duck }, true);
    arb.release("music");
    expect(duck).not.toHaveBeenCalled();
  });
});

describe("SessionArbiter: speech is an interruption (V60, B25)", () => {
  function setupMode(mode: SoundMode) {
    const s = fake();
    const arb = new SessionArbiter(
      () => s,
      (m) => ({ title: m.title }) as unknown as MediaMetadata,
      () => ({ mode, level: 35 }),
    );
    return arb;
  }
  function resumable(id: SessionOwnerId) {
    const c = claim(id);
    const resume = vi.fn();
    return { ...c, c: { ...c.c, resume }, resume };
  }
  /** Music plays, then speech starts over it (music reports its pause). */
  function speechOverMusic(mode: SoundMode) {
    const arb = setupMode(mode);
    const music = resumable("music");
    arb.claim(music.c, true);
    arb.setState("music", "playing");
    arb.claim(claim("speech").c, true);
    arb.setState("speech", "playing");
    if (mode === "pause") arb.setState("music", "paused");
    return { arb, music };
  }

  it("pause: what speech paused plays again when speech stops or ends", () => {
    const { arb, music } = speechOverMusic("pause");
    expect(music.pause).toHaveBeenCalledOnce();
    arb.release("speech");
    expect(music.resume).toHaveBeenCalledOnce();
  });

  it("pause: the owner pausing speech lets it go; speech playing again pauses and holds it again", () => {
    const { arb, music } = speechOverMusic("pause");
    arb.setState("speech", "paused");
    arb.endInterruption();
    expect(music.resume).toHaveBeenCalledOnce();
    // The resume plays the music again (the store claims it).
    arb.claim(music.c, true);
    arb.setState("music", "playing");
    arb.claim(claim("speech").c, true);
    arb.setState("speech", "playing");
    expect(music.pause).toHaveBeenCalledTimes(2);
    arb.setState("music", "paused");
    arb.release("speech");
    expect(music.resume).toHaveBeenCalledTimes(2);
  });

  it("pause: a speech pause alone (the sleep timer's) keeps it held until speech stops", () => {
    const { arb, music } = speechOverMusic("pause");
    arb.setState("speech", "paused");
    expect(music.resume).not.toHaveBeenCalled();
    arb.release("speech");
    expect(music.resume).toHaveBeenCalledOnce();
  });

  it("pause: played again by hand under speech, it isn't resumed twice", () => {
    const { arb, music } = speechOverMusic("pause");
    arb.setState("speech", "paused");
    arb.claim(music.c, true);
    arb.setState("music", "playing");
    arb.release("speech");
    expect(music.resume).not.toHaveBeenCalled();
  });

  it("pause: stopped while speech spoke, it stays stopped", () => {
    const { arb, music } = speechOverMusic("pause");
    arb.release("music");
    arb.release("speech");
    expect(music.resume).not.toHaveBeenCalled();
  });

  it("pause: a music or video start pauses for good (only speech is an interruption)", () => {
    const arb = setupMode("pause");
    const video = resumable("video");
    arb.claim(video.c, true);
    arb.setState("video", "playing");
    arb.claim(claim("music").c, true);
    arb.setState("music", "playing");
    arb.setState("video", "paused");
    arb.release("music");
    expect(video.resume).not.toHaveBeenCalled();
  });

  it("pause: a video started by hand under paused speech isn't hijacked when speech stops", () => {
    const { arb, music } = speechOverMusic("pause");
    const video = resumable("video");
    arb.claim(video.c, true);
    arb.setState("video", "playing");
    arb.setState("speech", "paused");
    arb.release("speech");
    expect(music.resume).not.toHaveBeenCalled();
    expect(video.pause).not.toHaveBeenCalled();
  });

  it("duck and mix: nothing was paused, so nothing is resumed", () => {
    for (const mode of ["duck", "mix"] as const) {
      const { arb, music } = speechOverMusic(mode);
      arb.release("speech");
      expect(music.pause).not.toHaveBeenCalled();
      expect(music.resume).not.toHaveBeenCalled();
    }
  });
});
