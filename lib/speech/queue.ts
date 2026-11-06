import type { Pcm, SynthResult } from "./engine";
import { UNIT_MIN, budgetCap, cutUnit, nextCap, skipSpaces } from "./units";

// The speech queue (SPEC V47): sentences in, gapless audio out. Adapted from
// companion-tts `queue.ts`: units play strictly in order, synthesis runs
// ahead of the playhead, and a result that arrives after a stop or seek is
// dropped, never played. New here:
//
// - Units are cut lazily from the sentences with a ramping cap (units.ts).
// - Units are scheduled back to back on one audio clock: start(n+1) = end(n).
// - Prefetch counts queued audio seconds, not units: synthesis runs while
//   less than 12 s is queued, and never with fewer than 2 units waiting.
// - Synthesized units stay cached (the 2 sentences behind the playhead and
//   everything ahead), so next and prev play without waiting on the engine.
//
// One synthesis at a time: Piper runs on one worker thread anyway, and a
// serial queue makes stop and seek exact.

/** A unit's audio, scheduled on the clock. */
export interface Slot {
  start: number;
  end: number;
  stop(): void;
}

/** Where audio plays. `now` is the clock units are scheduled on, in seconds. */
export interface AudioSink {
  now(): number;
  play(pcm: Pcm, at: number): Slot;
}

export interface QueueDeps {
  synth(text: string, rate: number, signal: AbortSignal): Promise<SynthResult>;
  sink: AudioSink;
  /** Sentence `i` started playing (its first unit's audio began). */
  onSentence(i: number): void;
  /** The last sentence finished. */
  onEnd(): void;
  /** Synthesis failed; the queue has stopped. */
  onError(error: unknown): void;
}

export interface QueueStats {
  /** Largest silence between consecutive units since play or seek, in ms. */
  maxGapMs: number;
  /** Times the audio ran dry before the next unit was ready. */
  underruns: number;
  /** Measured real-time factor (synthesis time ÷ audio time). */
  rtf: number;
}

const PREFETCH_SECONDS = 12;
const MIN_WAITING = 2;
const KEEP_BEHIND = 2;
/** Scheduling margin when nothing is playing: never start a buffer in the past. */
const LEAD = 0.03;
const TICK_MS = 50;
/** Starting guesses until measured: one-thread Piper (ADR-0012) and about 15 characters a second. */
const RTF_START = 0.4;
const SECONDS_PER_CHAR_START = 1 / 15;
const EMA = 0.3;

interface Unit {
  sentence: number;
  from: number;
  /** Where the next unit of the sentence starts (≥ its length: the sentence is done). */
  to: number;
  pcm: Pcm;
  duration: number;
  slot: Slot | null;
  announced: boolean;
}

const key = (sentence: number, from: number) => `${String(sentence)}:${String(from)}`;
const ema = (prev: number, next: number) => prev + EMA * (next - prev);

export class SpeechQueue {
  private sentences: readonly string[] = [];
  private cursor = { sentence: 0, from: 0 };
  /** Synthesized units from the playhead on, in play order. */
  private ahead: Unit[] = [];
  private cache = new Map<string, Unit>();
  private inflight: AbortController | null = null;
  private rampCap = UNIT_MIN;
  private lastEnd: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private rate = 1;
  private active = false;
  private maxGap = 0;
  private underruns = 0;
  private rtf = RTF_START;
  private secondsPerChar = SECONDS_PER_CHAR_START;
  /** The sentence playing (or about to, right after a seek). */
  current = -1;

  constructor(private readonly deps: QueueDeps) {}

  get playing(): boolean {
    return this.active;
  }

  stats(): QueueStats {
    return { maxGapMs: Math.round(this.maxGap * 1000), underruns: this.underruns, rtf: this.rtf };
  }

  start(sentences: readonly string[], from: number, rate: number): void {
    this.stop();
    this.sentences = sentences;
    this.rate = rate;
    this.active = true;
    this.timer = setInterval(this.tick, TICK_MS);
    this.seek(from);
  }

  /** Plays from the start of sentence `i`. Pending synthesis is aborted and queued audio dropped; cached units are kept. */
  seek(i: number): void {
    if (!this.active) return;
    if (i >= this.sentences.length) {
      this.finish();
      return;
    }
    const target = Math.max(0, Math.floor(i));
    this.abortInflight();
    for (const u of this.ahead) u.slot?.stop();
    this.ahead = [];
    this.cursor = { sentence: target, from: 0 };
    this.rampCap = UNIT_MIN;
    this.lastEnd = null;
    this.maxGap = 0;
    this.current = target;
    this.evict();
    this.pump();
  }

  next(): void {
    this.seek(this.current + 1);
  }

  prev(): void {
    this.seek(Math.max(0, this.current - 1));
  }

  /** New speed: the unit playing finishes as it is; everything after it is synthesized again. */
  setRate(rate: number): void {
    if (!this.active || rate === this.rate) {
      this.rate = rate;
      return;
    }
    this.rate = rate;
    this.cache.clear();
    this.abortInflight();
    const now = this.deps.sink.now();
    const playing = this.ahead.find((u) => u.slot !== null && u.slot.start <= now && u.slot.end > now);
    for (const u of this.ahead) if (u !== playing) u.slot?.stop();
    if (playing?.slot) {
      this.ahead = [playing];
      this.cursor = this.after(playing);
      this.lastEnd = playing.slot.end;
    } else {
      this.ahead = [];
      this.cursor = { sentence: Math.max(0, this.current), from: 0 };
      this.lastEnd = null;
    }
    this.rampCap = UNIT_MIN;
    this.pump();
  }

  stop(): void {
    this.active = false;
    this.abortInflight();
    for (const u of this.ahead) u.slot?.stop();
    this.ahead = [];
    this.cache.clear();
    this.lastEnd = null;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private finish(): void {
    this.stop();
    this.deps.onEnd();
  }

  private abortInflight(): void {
    this.inflight?.abort();
    this.inflight = null;
  }

  private after(u: Unit): { sentence: number; from: number } {
    const text = this.sentences[u.sentence] ?? "";
    return u.to >= text.length ? { sentence: u.sentence + 1, from: 0 } : { sentence: u.sentence, from: u.to };
  }

  /** Audio seconds queued from now on: what's left of the scheduled units plus any not yet scheduled. */
  private queuedSeconds(now: number): number {
    let total = 0;
    for (const u of this.ahead) total += u.slot ? Math.max(0, u.slot.end - Math.max(now, u.slot.start)) : u.duration;
    return total;
  }

  private wantsMore(now: number): boolean {
    if (this.cursor.sentence >= this.sentences.length) return false;
    const waiting = this.ahead.filter((u) => !u.slot || u.slot.start > now).length;
    return waiting < MIN_WAITING || this.queuedSeconds(now) < PREFETCH_SECONDS;
  }

  private pump(): void {
    if (!this.active) return;
    const now = this.deps.sink.now();
    for (const u of this.ahead) if (!u.slot) this.schedule(u, now);
    while (this.active && !this.inflight && this.wantsMore(now)) {
      const { sentence, from } = this.cursor;
      const text = this.sentences[sentence] ?? "";
      if (from >= text.length || !text.trim()) {
        this.cursor = { sentence: sentence + 1, from: 0 };
        continue;
      }
      const cached = this.cache.get(key(sentence, from));
      if (cached) {
        const unit: Unit = { ...cached, slot: null, announced: false };
        this.cache.set(key(sentence, from), unit);
        this.ahead.push(unit);
        this.schedule(unit, now);
        this.cursor = this.after(unit);
        continue;
      }
      this.synthNext(sentence, from, text, now);
    }
  }

  private synthNext(sentence: number, from: number, text: string, now: number): void {
    const cap = Math.min(this.rampCap, budgetCap(this.queuedSeconds(now), this.rtf, this.secondsPerChar));
    const end = cutUnit(text, from, cap);
    const piece = text.slice(from, end).trim();
    const to = skipSpaces(text, end);
    this.rampCap = nextCap(this.rampCap, this.rtf);
    this.cursor = to >= text.length ? { sentence: sentence + 1, from: 0 } : { sentence, from: to };
    const ctrl = new AbortController();
    this.inflight = ctrl;
    this.deps.synth(piece, this.rate, ctrl.signal).then(
      (res) => {
        // Stopped, seeking or re-rated while in flight: a late result must not play.
        if (ctrl.signal.aborted || this.inflight !== ctrl) return;
        this.inflight = null;
        const duration = res.samples.length / res.sampleRate;
        if (duration > 0) {
          this.rtf = ema(this.rtf, res.synthMs / 1000 / duration);
          this.secondsPerChar = ema(this.secondsPerChar, duration / piece.length);
        }
        const unit: Unit = { sentence, from, to, pcm: { samples: res.samples, sampleRate: res.sampleRate }, duration, slot: null, announced: false };
        this.cache.set(key(sentence, from), unit);
        this.ahead.push(unit);
        this.pump();
      },
      (error: unknown) => {
        if (ctrl.signal.aborted || this.inflight !== ctrl) return;
        this.inflight = null;
        this.stop();
        this.deps.onError(error);
      },
    );
  }

  private schedule(u: Unit, now: number): void {
    let at = this.lastEnd ?? now + LEAD;
    if (at < now) {
      // The audio ran dry before this unit was ready.
      this.underruns++;
      at = now + LEAD;
    }
    if (this.lastEnd !== null) this.maxGap = Math.max(this.maxGap, at - this.lastEnd);
    u.slot = this.deps.sink.play(u.pcm, at);
    this.lastEnd = u.slot.end;
  }

  private evict(): void {
    const keepFrom = this.current - KEEP_BEHIND;
    for (const [k, u] of this.cache) if (u.sentence < keepFrom) this.cache.delete(k);
  }

  private readonly tick = (): void => {
    if (!this.active) return;
    const now = this.deps.sink.now();
    for (const u of this.ahead) {
      if (!u.slot || u.slot.start > now) break;
      if (u.announced) continue;
      u.announced = true;
      if (u.from === 0 || u.sentence !== this.current) {
        this.current = u.sentence;
        this.deps.onSentence(u.sentence);
      }
    }
    while (this.ahead[0]?.slot && this.ahead[0].slot.end <= now) this.ahead.shift();
    this.evict();
    if (this.ahead.length === 0 && !this.inflight && this.cursor.sentence >= this.sentences.length) {
      this.finish();
      return;
    }
    this.pump();
  };
}
