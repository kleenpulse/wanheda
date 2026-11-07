import type { QueueLogEntry } from "./queue";

// The Phase 6 exit log (SPEC V50, T58). Off unless the owner sets
// localStorage `wanheda:speech-log` to "1". While on, each Piper play keeps
// its queue's log lines with wall-clock times, prints a summary when it ends,
// and `wanhedaSpeech.summary()` / `wanhedaSpeech.rows()` read the latest run
// from the console. Nothing is sent anywhere.

export const EXIT_LOG_FLAG = "wanheda:speech-log";

export function exitLogOn(): boolean {
  try {
    return globalThis.localStorage.getItem(EXIT_LOG_FLAG) === "1";
  } catch {
    return false;
  }
}

/** A scheduled unit, with its start on the page's clock (performance.now() ms). */
export interface ExitLogUnit {
  sentence: number;
  from: number;
  chars: number;
  startMs: number;
  gapMs: number | null;
  underrun: boolean;
  synthMs: number;
  rtf: number;
  cached: number;
  heapMB: number | null;
}

export interface ExitLogSummary {
  voice: string;
  /** From the press to the first unit's audio. */
  firstAudioMs: number | null;
  units: number;
  /** Largest silence between consecutive units, across seeks (a seek's first unit has no gap). */
  maxGapMs: number;
  underruns: number;
  /** Sentence switches announced, and how late after their audio began. */
  switches: number;
  lateP50Ms: number | null;
  lateMaxMs: number;
  rtf: number | null;
  maxCached: number;
  heapStartMB: number | null;
  heapEndMB: number | null;
  ms: number;
  /** Steps of the first audio, ms after the press: play, driver (engine chosen), synth-sent, synth-back. */
  marks: Record<string, number>;
}

const round = (n: number) => Math.round(n * 10) / 10;

function heapMB(): number | null {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return memory ? round(memory.usedJSHeapSize / 1048576) : null;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] ?? null) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

export class ExitLog {
  readonly units: ExitLogUnit[] = [];
  readonly late: number[] = [];
  readonly marks: Record<string, number> = {};
  private readonly heapStart = heapMB();
  private ended: ExitLogSummary | null = null;

  constructor(
    readonly voice: string,
    /** performance.now() at the press. */
    readonly pressAt: number,
    private readonly clock: () => number = () => performance.now(),
  ) {}

  /** The first time a step happens (`at` on the page clock; default now). */
  mark(name: string, at: number = this.clock()): void {
    if (this.ended || name in this.marks) return;
    this.marks[name] = round(at - this.pressAt);
  }

  /** The queue's `log`: called in the same turn as the queue's own clock read. */
  readonly entry = (e: QueueLogEntry): void => {
    if (this.ended) return;
    if (e.kind === "sentence") {
      this.late.push(e.lateMs);
      return;
    }
    this.units.push({
      sentence: e.sentence,
      from: e.from,
      chars: e.chars,
      startMs: round(this.clock() + (e.at - e.now) * 1000),
      gapMs: e.gapMs === null ? null : round(e.gapMs),
      underrun: e.underrun,
      synthMs: round(e.synthMs),
      rtf: Math.round(e.rtf * 1000) / 1000,
      cached: e.cached,
      heapMB: heapMB(),
    });
  };

  summary(): ExitLogSummary {
    if (this.ended) return this.ended;
    const first = this.units[0];
    const gaps = this.units.flatMap((u) => (u.gapMs === null ? [] : [u.gapMs]));
    const p50 = median(this.late);
    return {
      voice: this.voice,
      firstAudioMs: first ? round(first.startMs - this.pressAt) : null,
      units: this.units.length,
      maxGapMs: round(Math.max(0, ...gaps)),
      underruns: this.units.filter((u) => u.underrun).length,
      switches: this.late.length,
      lateP50Ms: p50 === null ? null : round(p50),
      lateMaxMs: round(Math.max(0, ...this.late)),
      rtf: this.units.at(-1)?.rtf ?? null,
      maxCached: Math.max(0, ...this.units.map((u) => u.cached)),
      heapStartMB: this.heapStart,
      heapEndMB: heapMB(),
      ms: round(this.clock() - this.pressAt),
      marks: { ...this.marks },
    };
  }

  /** Freezes the summary and prints it once. */
  end(): ExitLogSummary {
    if (this.ended) return this.ended;
    this.ended = this.summary();
    console.info("[wanheda] speech exit log", this.ended);
    return this.ended;
  }
}

let latest: ExitLog | null = null;

/** A log for a new Piper play when the flag is on, else null. The console handle reads the latest. */
export function startExitLog(voice: string, pressAt: number, playAt: number): ExitLog | null {
  if (!exitLogOn()) return null;
  latest = new ExitLog(voice, pressAt);
  latest.mark("play", playAt);
  latest.mark("driver");
  (globalThis as { wanhedaSpeech?: unknown }).wanhedaSpeech = {
    summary: () => latest?.summary() ?? null,
    rows: () => latest?.units ?? [],
  };
  return latest;
}
