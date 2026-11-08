import { DEFAULT_SOUND_MIX, duckGain, soundMixPref, startPauses, type SoundMix, type SoundOwner } from "./sound-mix";

// One owner of the Media Session per tab (V60): speech, video or music. The
// last to start owns the OS media keys and the lock-screen metadata; nothing
// else writes `navigator.mediaSession`. How a start treats the others is the
// Sound setting (sound-mix.ts): `pause` pauses them, `duck` lowers music and
// video while speech plays, `mix` leaves them; video and music always pause
// each other. Releasing the owner hands the keys back to the newest claim still held.
// Speech is an interruption: what a speech start paused plays again when speech
// lets go (stop, or the end), unless it was played or stopped in the meantime.

export type SessionOwnerId = SoundOwner;

export type SessionMetadata = { title: string; artist: string; album: string };

export type SessionClaim = {
  id: SessionOwnerId;
  metadata: SessionMetadata;
  handlers: Partial<Record<MediaSessionAction, (details: MediaSessionActionDetails) => void>>;
  /** Stops this owner's sound when another starts. */
  pause: () => void;
  /** Music and video: plays again after the speech that paused it lets go. */
  resume?: () => void;
  /** Music and video: the gain to ramp to (1 = full), when speech ducks them or lets go. */
  duck?: (gain: number) => void;
};

/** The parts of `navigator.mediaSession` the arbiter writes, so tests can fake it. */
export type SessionLike = {
  metadata: MediaMetadata | null;
  playbackState: MediaSessionPlaybackState;
  setActionHandler: (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => void;
};

export const SESSION_ACTIONS: readonly MediaSessionAction[] = [
  "play",
  "pause",
  "stop",
  "previoustrack",
  "nexttrack",
  "seekbackward",
  "seekforward",
  "seekto",
];

export class SessionArbiter {
  private claims: SessionClaim[] = [];
  private states = new Map<SessionOwnerId, MediaSessionPlaybackState>();
  /** The gain each claim was last told, so a duck call goes out only on a change. */
  private ducked = new WeakMap<SessionClaim, number>();
  /** The owners a speech start paused, still waiting for speech to let go. */
  private heldBySpeech = new Set<SessionOwnerId>();

  constructor(
    private readonly session: () => SessionLike | null,
    private readonly toMetadata: (m: SessionMetadata) => MediaMetadata,
    private readonly mix: () => SoundMix = () => DEFAULT_SOUND_MIX,
  ) {}

  get owner(): SessionOwnerId | null {
    return this.claims.at(-1)?.id ?? null;
  }

  /**
   * Takes or refreshes the session. `starting` = this owner just began to
   * play: it moves to the top and the others still playing are paused. A
   * refresh (new metadata or handlers, not starting) keeps its place.
   */
  claim(c: SessionClaim, starting: boolean): void {
    const at = this.claims.findIndex((x) => x.id === c.id);
    const top = this.claims.at(-1);
    if (!starting && at < 0 && top && this.states.get(top.id) === "playing") {
      // Not playing yet (speech still loading): wait below the playing owner.
      this.claims.splice(this.claims.length - 1, 0, c);
    } else if (starting || at < 0) {
      if (at >= 0) this.claims.splice(at, 1);
      if (starting) {
        // Played again by hand: it no longer waits for speech.
        this.heldBySpeech.delete(c.id);
        const { mode } = this.mix();
        // A music or video start is a new choice: what it would pause stops waiting for speech too,
        // or speech letting go would bring it back over this one.
        if (c.id !== "speech") for (const id of this.heldBySpeech) if (startPauses(c.id, id, mode)) this.heldBySpeech.delete(id);
        for (const other of this.claims) {
          if (this.states.get(other.id) !== "playing" || !startPauses(c.id, other.id, mode)) continue;
          other.pause();
          if (c.id === "speech") this.heldBySpeech.add(other.id);
        }
      }
      this.claims.push(c);
    } else {
      this.claims[at] = c;
    }
    this.apply();
    this.applyDuck();
  }

  /** The owner's playing|paused state; written to the OS only for the current owner. */
  setState(id: SessionOwnerId, state: MediaSessionPlaybackState): void {
    this.states.set(id, state);
    if (state === "playing") this.heldBySpeech.delete(id);
    const s = this.session();
    if (s && this.owner === id) s.playbackState = state;
    this.applyDuck();
  }

  release(id: SessionOwnerId): void {
    const was = this.owner;
    // A ducked owner leaving gets its full level back first, or the next play starts at the duck level.
    for (const c of this.claims) {
      if (c.id !== id || !c.duck || (this.ducked.get(c) ?? 1) === 1) continue;
      this.ducked.set(c, 1);
      c.duck(1);
    }
    this.claims = this.claims.filter((c) => c.id !== id);
    this.states.delete(id);
    if (was === id) this.apply();
    this.applyDuck();
    if (id !== "speech") {
      this.heldBySpeech.delete(id);
      return;
    }
    // Last, once the arbiter is settled: a resume claims the session again.
    const held = this.claims.filter((c) => this.heldBySpeech.has(c.id) && this.states.get(c.id) === "paused");
    this.heldBySpeech.clear();
    for (const c of held) c.resume?.();
  }

  /** The Sound setting changed: music and video take the new gain at once. */
  refresh(): void {
    this.applyDuck();
  }

  private applyDuck(): void {
    const mix = this.mix();
    const speechPlaying = this.states.get("speech") === "playing";
    for (const c of this.claims) {
      if (!c.duck) continue;
      const gain = duckGain(c.id, mix, speechPlaying);
      if ((this.ducked.get(c) ?? 1) === gain) continue;
      this.ducked.set(c, gain);
      c.duck(gain);
    }
  }

  private apply(): void {
    const s = this.session();
    if (!s) return;
    const top = this.claims.at(-1);
    s.metadata = top ? this.toMetadata(top.metadata) : null;
    s.playbackState = top ? (this.states.get(top.id) ?? "paused") : "none";
    for (const action of SESSION_ACTIONS) {
      const fn = top?.handlers[action];
      try {
        s.setActionHandler(
          action,
          fn
            ? (d) => {
                fn(d);
              }
            : null,
        );
      } catch {
        // This browser doesn't offer the action.
      }
    }
  }
}

/** The tab's arbiter, over the real `navigator.mediaSession`. */
export const mediaSession = new SessionArbiter(
  () => (typeof navigator !== "undefined" && "mediaSession" in navigator ? navigator.mediaSession : null),
  (m) => new MediaMetadata(m),
  () => soundMixPref.get(),
);

soundMixPref.watch(() => {
  mediaSession.refresh();
});
