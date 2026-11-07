// Which live activity the island shows (V61): media and speech first, then
// timers, then transfers, then sync; alerts queue behind them (V31). Within a
// rank the newest started comes first. The island still cycles through all of
// them; this only decides the order and which one leads.

export type RankKind = "media" | "speech" | "timer" | "pomodoro" | "transfer" | "sync" | "alert";

export const RANK: Record<RankKind, number> = { media: 0, speech: 0, timer: 1, pomodoro: 1, transfer: 2, sync: 3, alert: 4 };

export type Ranked<T> = { item: T; kind: RankKind; startedAt: number };

/** By rank, then newest started; ties keep their given order. */
export function rankActivities<T>(xs: readonly Ranked<T>[]): Ranked<T>[] {
  return xs
    .map((x, i) => ({ x, i }))
    .sort((a, b) => RANK[a.x.kind] - RANK[b.x.kind] || b.x.startedAt - a.x.startedAt || a.i - b.i)
    .map(({ x }) => x);
}
