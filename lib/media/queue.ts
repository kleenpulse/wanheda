// The music queue (V59), pure: the list a play started from, the order it
// plays in, where it is, shuffle and repeat. Shuffle is Fisher–Yates over the
// rest of the list with the current track kept first; turning it off restores
// the list's order at the current track. Repeat is off, all or one.

export type Repeat = "off" | "all" | "one";
export const REPEATS: readonly Repeat[] = ["off", "all", "one"];

export type Queue<T> = {
  /** The list as it was given; never reordered. */
  items: readonly T[];
  /** Indexes into `items`, in play order. */
  order: readonly number[];
  /** Position in `order` of the current track. */
  at: number;
  shuffle: boolean;
  repeat: Repeat;
};

/** Previous within this many seconds of a track's start goes back a track; later, it restarts the track. */
export const PREV_RESTART_S = 3;

type Random = () => number;

/** Fisher–Yates, in place on a copy. */
function shuffled(xs: readonly number[], random: Random): number[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const t = out[i] as number;
    out[i] = out[j] as number;
    out[j] = t;
  }
  return out;
}

const identity = (n: number) => Array.from({ length: n }, (_, i) => i);

/** The current track first, then every other one in random order. */
function shuffleAround(n: number, current: number, random: Random): number[] {
  return [current, ...shuffled(identity(n).filter((i) => i !== current), random)];
}

export function startQueue<T>(items: readonly T[], index: number, opts: { shuffle: boolean; repeat: Repeat }, random: Random = Math.random): Queue<T> {
  const start = Math.min(Math.max(0, index), Math.max(0, items.length - 1));
  if (items.length === 0) return { items, order: [], at: 0, shuffle: opts.shuffle, repeat: opts.repeat };
  if (opts.shuffle) return { items, order: shuffleAround(items.length, start, random), at: 0, shuffle: true, repeat: opts.repeat };
  return { items, order: identity(items.length), at: start, shuffle: false, repeat: opts.repeat };
}

/** The item index playing now. */
export function currentIndex<T>(q: Queue<T>): number | null {
  return q.order[q.at] ?? null;
}

export function currentItem<T>(q: Queue<T>): T | null {
  const i = currentIndex(q);
  return i === null ? null : (q.items[i] ?? null);
}

export function setShuffle<T>(q: Queue<T>, on: boolean, random: Random = Math.random): Queue<T> {
  if (on === q.shuffle) return q;
  const current = currentIndex(q) ?? 0;
  if (on) return { ...q, order: shuffleAround(q.items.length, current, random), at: 0, shuffle: true };
  return { ...q, order: identity(q.items.length), at: current, shuffle: false };
}

export function cycleRepeat(r: Repeat): Repeat {
  return REPEATS[(REPEATS.indexOf(r) + 1) % REPEATS.length] ?? "off";
}

/**
 * What plays after item `index`: `auto` = the track ended on its own (repeat
 * one plays it again); a press of Next always moves on. Null = the queue is done.
 */
export function followingIndex<T>(q: Queue<T>, index: number, auto: boolean): number | null {
  if (auto && q.repeat === "one") return index;
  const at = q.order.indexOf(index);
  if (at < 0) return null;
  if (at + 1 < q.order.length) return q.order[at + 1] ?? null;
  return q.repeat === "off" ? null : (q.order[0] ?? null);
}

/** What Previous goes to from item `index`: the one before, wrapping with repeat; the first stays put. */
export function precedingIndex<T>(q: Queue<T>, index: number): number {
  const at = q.order.indexOf(index);
  if (at > 0) return q.order[at - 1] ?? index;
  return q.repeat !== "off" ? (q.order.at(-1) ?? index) : index;
}

/** Moves the queue's place to item `index` (a track became audible, or was picked). */
export function moveTo<T>(q: Queue<T>, index: number): Queue<T> {
  const at = q.order.indexOf(index);
  return at < 0 || at === q.at ? q : { ...q, at };
}

/** The tracks still to come, in play order (not counting a wrap). */
export function upNext<T>(q: Queue<T>, limit: number): { index: number; item: T }[] {
  const out: { index: number; item: T }[] = [];
  for (let k = q.at + 1; k < q.order.length && out.length < limit; k++) {
    const index = q.order[k];
    const item = index === undefined ? undefined : q.items[index];
    if (index !== undefined && item !== undefined) out.push({ index, item });
  }
  return out;
}
