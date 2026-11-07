// One owner of the Media Session per tab (V60): speech, video or music. The
// last to start owns the OS media keys and the lock-screen metadata; nothing
// else writes `navigator.mediaSession`. Starting one pauses the others (the
// `pause` mode, the default; T64 adds duck and mix). Releasing the owner
// hands the keys back to the newest claim still held.

export type SessionOwnerId = "speech" | "video" | "music";

export type SessionMetadata = { title: string; artist: string; album: string };

export type SessionClaim = {
  id: SessionOwnerId;
  metadata: SessionMetadata;
  handlers: Partial<Record<MediaSessionAction, (details: MediaSessionActionDetails) => void>>;
  /** Stops this owner's sound when another starts. */
  pause: () => void;
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

  constructor(
    private readonly session: () => SessionLike | null,
    private readonly toMetadata: (m: SessionMetadata) => MediaMetadata,
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
        for (const other of this.claims) if (this.states.get(other.id) === "playing") other.pause();
      }
      this.claims.push(c);
    } else {
      this.claims[at] = c;
    }
    this.apply();
  }

  /** The owner's playing|paused state; written to the OS only for the current owner. */
  setState(id: SessionOwnerId, state: MediaSessionPlaybackState): void {
    this.states.set(id, state);
    const s = this.session();
    if (s && this.owner === id) s.playbackState = state;
  }

  release(id: SessionOwnerId): void {
    const was = this.owner;
    this.claims = this.claims.filter((c) => c.id !== id);
    this.states.delete(id);
    if (was === id) this.apply();
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
);
