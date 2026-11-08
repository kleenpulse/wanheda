// A `<video>` element as an external store for `useSyncExternalStore` (T72,
// V65). The snapshot is the slow-moving state the chrome draws from: it is a
// new object only when a field really changed, so React never loops on it
// and a playing video commits about once a second (the whole second), never
// once a frame. The clock and the scrub head are painted from the element
// directly, outside React.

/** The parts of an HTMLVideoElement the store reads (a fake one in tests). */
export type VideoLike = EventTarget & {
  readonly paused: boolean;
  readonly ended: boolean;
  readonly duration: number;
  readonly currentTime: number;
  readonly volume: number;
  readonly muted: boolean;
  readonly playbackRate: number;
  readonly videoWidth: number;
  readonly videoHeight: number;
  readonly readyState: number;
  readonly seeking: boolean;
};

export type VideoSnapshot = {
  paused: boolean;
  ended: boolean;
  /** Waiting for data while it should be playing (the spinner). */
  waiting: boolean;
  /** Seconds, NaN until known. */
  duration: number;
  /** The whole second it's at: enough for the autoplay card and "left" labels. */
  second: number;
  volume: number;
  muted: boolean;
  rate: number;
  width: number;
  height: number;
  pip: boolean;
};

const EVENTS = [
  "play",
  "pause",
  "playing",
  "waiting",
  "seeking",
  "seeked",
  "ended",
  "durationchange",
  "loadedmetadata",
  "loadeddata",
  "canplay",
  "timeupdate",
  "volumechange",
  "ratechange",
  "resize",
  "emptied",
  "enterpictureinpicture",
  "leavepictureinpicture",
] as const;

/** HAVE_FUTURE_DATA: below this a playing element is stalled. */
const HAVE_FUTURE_DATA = 3;

function sameValue(a: number, b: number): boolean {
  return a === b || (Number.isNaN(a) && Number.isNaN(b));
}

function equal(a: VideoSnapshot, b: VideoSnapshot): boolean {
  return (
    a.paused === b.paused &&
    a.ended === b.ended &&
    a.waiting === b.waiting &&
    sameValue(a.duration, b.duration) &&
    a.second === b.second &&
    a.volume === b.volume &&
    a.muted === b.muted &&
    a.rate === b.rate &&
    a.width === b.width &&
    a.height === b.height &&
    a.pip === b.pip
  );
}

export type VideoStore = { subscribe: (listener: () => void) => () => void; getSnapshot: () => VideoSnapshot };

/** `isPip` reads whether this element is the one in picture-in-picture (document state). */
export function createVideoStore(el: VideoLike, isPip: () => boolean): VideoStore {
  const read = (): VideoSnapshot => ({
    paused: el.paused,
    ended: el.ended,
    waiting: (!el.paused && el.readyState < HAVE_FUTURE_DATA) || (!el.paused && el.seeking),
    duration: el.duration,
    second: Math.floor(Number.isFinite(el.currentTime) ? el.currentTime : 0),
    volume: el.volume,
    muted: el.muted,
    rate: el.playbackRate,
    width: el.videoWidth,
    height: el.videoHeight,
    pip: isPip(),
  });
  let snapshot = read();
  const listeners = new Set<() => void>();
  const update = () => {
    const next = read();
    if (equal(next, snapshot)) return;
    snapshot = next;
    for (const l of listeners) l();
  };
  return {
    subscribe: (listener) => {
      if (listeners.size === 0) {
        for (const type of EVENTS) el.addEventListener(type, update);
        // Something may have changed while nobody listened.
        update();
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) for (const type of EVENTS) el.removeEventListener(type, update);
      };
    },
    getSnapshot: () => snapshot,
  };
}

const stores = new WeakMap<VideoLike, VideoStore>();

/** One store per element, shared by every reader of it. */
export function videoStore(el: VideoLike, isPip: () => boolean): VideoStore {
  let store = stores.get(el);
  if (!store) {
    store = createVideoStore(el, isPip);
    stores.set(el, store);
  }
  return store;
}
