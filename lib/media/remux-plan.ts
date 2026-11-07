// The remux's moving parts that must not race (V53), kept pure so they are
// tested without a browser: which conversion job is current, and whether a
// seek needs the remux restarted.

export type RemuxJob = {
  cancelled: boolean;
  /** Stops the job's conversion; set once the conversion exists. */
  cancel: (() => Promise<unknown>) | null;
  /** Element time of the newest fragment this job has written, or null before the first. */
  head: number | null;
  /** Element times the job was started to fill: [from, until). Before its first fragment, a stall in here is the job starting, not a gap. */
  from: number;
  until: number;
};

/**
 * Holds the one current job. `replace` swaps the new job in synchronously,
 * before awaiting the old one's cancel, so two quick seeks can never leave two
 * live jobs writing into one SourceBuffer.
 */
export class JobSlot {
  private job: RemuxJob | null = null;

  get current(): RemuxJob | null {
    return this.job;
  }

  async replace(target = 0): Promise<RemuxJob> {
    const prev = this.job;
    const next: RemuxJob = { cancelled: false, cancel: null, head: null, from: target, until: target + STARTING_S };
    this.job = next;
    if (prev) await stopJob(prev);
    return next;
  }

  async clear(): Promise<void> {
    const prev = this.job;
    this.job = null;
    if (prev) await stopJob(prev);
  }
}

async function stopJob(job: RemuxJob): Promise<void> {
  job.cancelled = true;
  await job.cancel?.().catch(() => undefined);
}

export type Range = readonly [start: number, end: number];

/** Tolerances: Chrome reports range edges a few ms off; fragments are ~1 s. */
const EDGE_S = 0.25;
const HEAD_S = 1.5;
/** How far past its target a job that hasn't written yet still counts as filling a stall. */
export const STARTING_S = 2;

export function rangeAt(ranges: readonly Range[], t: number): Range | null {
  return ranges.find(([s, e]) => s <= t + EDGE_S && t < e) ?? null;
}

/**
 * After a seek (or a stall) to `t`: restart unless `t` sits in a range that
 * the current job is still writing (its head is at that range's end) or that
 * already runs to the end of the file. A range left over from before an
 * earlier seek would otherwise play to its end and stall in the gap.
 */
export function needsRestart(
  ranges: readonly Range[],
  t: number,
  job: Pick<RemuxJob, "head" | "from" | "until"> | null,
  endS: number | null,
): boolean {
  // A job that hasn't written yet is about to fill its own target: the
  // `waiting` that play() or a seek fires must not restart it.
  if (job && job.head === null && t >= job.from - EDGE_S && t < job.until) return false;
  const head = job?.head ?? null;
  const r = rangeAt(ranges, t);
  if (!r) return true;
  if (endS !== null && r[1] >= endS - 0.5) return false;
  if (head !== null && head >= r[0] - EDGE_S && head <= r[1] + HEAD_S) return false;
  return true;
}

/**
 * Where a restart for `t` begins, in element time: the end of a stale range
 * holding `t` (so only the gap is filled), else `t`. The worker then backs up
 * to the keyframe at or before it.
 */
export function restartFrom(ranges: readonly Range[], t: number): number {
  return rangeAt(ranges, t)?.[1] ?? t;
}

export function toRanges(r: TimeRanges): Range[] {
  const out: Range[] = [];
  for (let i = 0; i < r.length; i++) out.push([r.start(i), r.end(i)]);
  return out;
}
