import { ALL_FORMATS, AudioBufferSink, BlobSource, Input, Mp3InputFormat } from "mediabunny";
import { DUCK_RAMP } from "@/lib/motion";
import { clipChunk, id3Size, mp3TailSamples } from "./lame";
import { fillTone, toneSpec } from "./tones";

// The music engine (V59, ADR-0013): one AudioContext, its clock the one every
// track is scheduled on. A track is decoded in a stream (Mediabunny's
// AudioBufferSink, chunks of a few thousand frames), never whole, and each
// chunk is clipped to the track's exact span: the leading delay comes as
// negative timestamps and is dropped, and an MP3's tail padding is cut from
// its LAME header. Track n+1's first sample is scheduled at track n's last on
// the context clock, so an album plays without a gap. At most LOOKAHEAD_S of
// sound is scheduled ahead, so memory stays flat for an hour-long mix.
//
//   chunk sources → volume → duck (ramped under speech, V60) → fade (another sound taking over) → analyser → destination
//
// The analyser feeds the island's equalizer the sound as heard.
//
// Loaded only when music plays (V62): Mediabunny never reaches the shell bundle.

const LOOKAHEAD_S = 8;
/** A fresh start lands this far ahead of the clock, so its first chunk is never late. */
const START_LEAD_S = 0.08;
const POLL_MS = 250;
/** Tracks in a row that wouldn't open before the engine gives up on the queue. */
const MAX_FAILURES = 5;
const TONE_CHUNK = 4096;

/** A failure the owner can read. */
export class PlayError extends Error {
  /** Nothing else in the queue can play either (no access to the folder): stop instead of trying the next. */
  readonly stop: boolean;
  constructor(message: string, opts: { stop?: boolean } = {}) {
    super(message);
    this.stop = opts.stop ?? false;
  }
}

export type Chunk = { buffer: AudioBuffer; timestamp: number };

/** An open track: its playable length, and its sound as a stream of chunks from a point. */
export type Opened = {
  end: number;
  buffers: (from: number) => AsyncIterable<Chunk>;
  close: () => void;
};

export type EngineEvents = {
  /** Item `key` became audible: a play, a seek, or the seam into it. */
  onTrack: (key: number, durationS: number) => void;
  /** Nothing more is coming: the last track ended. */
  onEnd: () => void;
  /** Item `key` couldn't be played; the engine has moved on. */
  onError: (key: number, message: string) => void;
};

export type EngineDeps = {
  open: (key: number, ctx: BaseAudioContext) => Promise<Opened>;
  /** What follows item `key`: `auto` = it ended on its own (repeat one plays it again). */
  following: (key: number, auto: boolean) => number | null;
};

type Segment = {
  key: number;
  /** Context time of the track's second 0. */
  zero: number;
  from: number;
  end: number;
  /** Context time its first sound plays, and its last ends. */
  audibleAt: number;
  endsAt: number;
  nodes: Set<AudioBufferSourceNode>;
  firstStart: number | null;
  lastEnd: number | null;
  done: boolean;
  /** Nothing follows it. */
  last: boolean;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const CODEC_NAMES: Record<string, string> = { ac3: "Dolby Digital (AC3)", eac3: "Dolby Digital Plus (E-AC3)", dts: "DTS", truehd: "Dolby TrueHD", vorbis: "Vorbis" };

/** Opens an audio file for streaming, clipped to its exact length (V59). */
export async function openFile(file: File): Promise<Opened> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack().catch(() => null);
    if (!track) throw new PlayError("There's no audio this browser can read in the file.");
    if (!(await track.canDecode())) {
      const codec = await track.getCodec();
      throw new PlayError(`This browser can't decode ${codec ? (CODEC_NAMES[codec] ?? codec.toUpperCase()) : "its"} audio.`);
    }
    const duration = await track.computeDuration();
    let tail = 0;
    if ((await input.getFormat()) instanceof Mp3InputFormat) {
      const skip = id3Size(new Uint8Array(await file.slice(0, 10).arrayBuffer()));
      tail = mp3TailSamples(new Uint8Array(await file.slice(skip, skip + 8192).arrayBuffer())) / (await track.getSampleRate());
    }
    const sink = new AudioBufferSink(track);
    return {
      end: Math.max(0, duration - tail),
      // From 0, start at the first packet: the leading delay's negative timestamps come first and are clipped.
      buffers: (from) => (from > 0 ? sink.buffers(from) : sink.buffers()),
      close: () => {
        input.dispose();
      },
    };
  } catch (e) {
    input.dispose();
    throw e;
  }
}

/** A demo track: its tone made in chunks, like a decoded file. */
export function openTone(path: string, seconds: number, ctx: BaseAudioContext): Opened {
  const spec = toneSpec(path);
  const rate = ctx.sampleRate;
  const total = Math.round(seconds * rate);
  return {
    end: total / rate,
    buffers: async function* (from) {
      for (let start = Math.max(0, Math.floor(from * rate)); start < total; start += TONE_CHUNK) {
        const n = Math.min(TONE_CHUNK, total - start);
        const buffer = ctx.createBuffer(1, n, rate);
        buffer.copyToChannel(fillTone(spec, start, n, rate, seconds), 0);
        yield { buffer, timestamp: start / rate };
        await Promise.resolve();
      }
    },
    close: () => undefined,
  };
}

const message = (e: unknown) => (e instanceof PlayError ? e.message : "The file couldn't be decoded.");

export class MusicEngine {
  private ctx: AudioContext | null = null;
  private volume: GainNode | null = null;
  private ducker: GainNode | null = null;
  private fader: GainNode | null = null;
  /** The suspend at the end of a fade-out; a resume or a play before it cancels it. */
  private fadeTimer: ReturnType<typeof setTimeout> | undefined;
  private analyser: AnalyserNode | null = null;
  private duckTarget = 1;
  /** The volume's gain, kept for the next graph. */
  private gain = 1;
  /** Bumped to stop every pump in flight (a new play, a seek, a stop, a new next). */
  private gen = 0;
  private segments: Segment[] = [];
  private shown: Segment | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private failures = 0;
  /** Gap at each seam, in ms: the gapless check (T65). */
  readonly seams: { key: number; gapMs: number }[] = [];

  constructor(
    private readonly deps: EngineDeps,
    private readonly events: EngineEvents,
  ) {}

  private ensure(): AudioContext {
    if (this.ctx && this.ctx.state !== "closed") return this.ctx;
    const ctx = new AudioContext({ latencyHint: "playback" });
    const volume = ctx.createGain();
    volume.gain.value = this.gain;
    const ducker = ctx.createGain();
    ducker.gain.value = this.duckTarget;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    // Little smoothing: the bars do their own easing, and a beat should land at once.
    analyser.smoothingTimeConstant = 0.2;
    const fader = ctx.createGain();
    volume.connect(ducker);
    ducker.connect(fader);
    fader.connect(analyser);
    // The analyser must chain on to the destination, or the music goes silent.
    analyser.connect(ctx.destination);
    this.ctx = ctx;
    this.volume = volume;
    this.ducker = ducker;
    this.fader = fader;
    this.analyser = analyser;
    return ctx;
  }

  /** Frequency bins of the sound as heard (byte data), or false when nothing is playing. */
  levels(out: Uint8Array<ArrayBuffer>): boolean {
    if (!this.analyser || this.ctx?.state !== "running") return false;
    this.analyser.getByteFrequencyData(out);
    return true;
  }

  /** Bins `levels` fills. */
  get bins(): number {
    return this.analyser?.frequencyBinCount ?? 32;
  }

  /** Plays item `key` from `from` seconds, dropping whatever was playing or scheduled. */
  play(key: number, from = 0): void {
    const ctx = this.ensure();
    this.clear();
    const gen = ++this.gen;
    this.failures = 0;
    this.fadeTo(1, 0);
    void ctx.resume();
    void this.pump(gen, key, Math.max(0, from), null);
    this.startTicker();
  }

  /**
   * Suspending the context stops its clock: every scheduled chunk waits and
   * resumes in step. With `fadeS`, the sound fades to silence first and the
   * context suspends at the end of the fade.
   */
  pause(fadeS = 0): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state === "closed") return;
    if (fadeS <= 0 || ctx.state !== "running") {
      this.fadeTo(1, 0);
      void ctx.suspend();
      return;
    }
    this.fadeTo(0, fadeS);
    this.fadeTimer = setTimeout(() => {
      if (ctx.state !== "closed") void ctx.suspend();
    }, fadeS * 1000);
  }

  /** With `fadeS`, the sound fades in from silence (or from where a fade-out had got to); without, it's at full at once. */
  resume(fadeS = 0): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state === "closed") return;
    // Suspended: the fade starts from silence. Mid fade-out: from where it got to.
    this.fadeTo(1, fadeS, ctx.state === "running" ? undefined : 0);
    void ctx.resume();
  }

  /** Ramps the fade gain to `to` over `seconds` (0 = at once) from `from` (default: where it is), dropping a pending fade-out's suspend. */
  private fadeTo(to: number, seconds: number, from?: number): void {
    clearTimeout(this.fadeTimer);
    this.fadeTimer = undefined;
    const ctx = this.ctx;
    const p = this.fader?.gain;
    if (!ctx || !p) return;
    const now = ctx.currentTime;
    p.cancelScheduledValues(now);
    if (seconds <= 0) {
      p.setValueAtTime(to, now);
      return;
    }
    p.setValueAtTime(from ?? p.value, now);
    p.linearRampToValueAtTime(to, now + seconds);
  }

  /** Where the audible track is: its key and seconds in. */
  position(): { key: number; seconds: number } | null {
    const seg = this.audible();
    if (!seg || !this.ctx) return null;
    return { key: seg.key, seconds: Math.min(seg.end, Math.max(seg.from, this.ctx.currentTime - seg.zero)) };
  }

  /**
   * The queue's order changed (shuffle, repeat, a pick): whatever was lined up
   * after the audible track is dropped and the next one asked for again. While
   * the audible track is still decoding, nothing is lined up yet.
   */
  replanNext(): void {
    const cur = this.audible();
    if (!cur?.done) return;
    const gen = ++this.gen;
    for (const s of this.segments) if (s.audibleAt > cur.audibleAt) this.silence(s);
    this.segments = this.segments.filter((s) => s.audibleAt <= cur.audibleAt);
    cur.last = false;
    this.continueAfter(gen, cur);
  }

  /** Ramps to `gain` (1 = full): ducking under speech and back (V60). */
  duck(gain: number): void {
    this.duckTarget = gain;
    const ctx = this.ctx;
    const p = this.ducker?.gain;
    if (!ctx || !p) return;
    const now = ctx.currentTime;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.linearRampToValueAtTime(gain, now + (gain < p.value ? DUCK_RAMP.down : DUCK_RAMP.up));
  }

  /** The volume's gain (0–1), glided over a few ms so a drag never clicks. */
  setVolume(gain: number): void {
    this.gain = Math.min(1, Math.max(0, gain));
    if (this.ctx && this.volume) this.volume.gain.setTargetAtTime(this.gain, this.ctx.currentTime, 0.015);
  }

  /** Stops everything and frees the audio device. The next play builds a new graph. */
  close(): void {
    this.gen++;
    this.clear();
    this.stopTicker();
    clearTimeout(this.fadeTimer);
    this.fadeTimer = undefined;
    const ctx = this.ctx;
    this.ctx = null;
    this.volume = null;
    this.ducker = null;
    this.fader = null;
    this.analyser = null;
    if (ctx && ctx.state !== "closed") void ctx.close();
  }

  private clear(): void {
    for (const s of this.segments) this.silence(s);
    this.segments = [];
    this.shown = null;
  }

  private silence(s: Segment): void {
    for (const n of s.nodes) {
      try {
        n.stop();
      } catch {
        // Never started.
      }
      n.disconnect();
    }
    s.nodes.clear();
  }

  /** The segment playing at the context's time (or the next to, during a start's lead-in). */
  private audible(): Segment | null {
    const now = this.ctx?.currentTime ?? 0;
    let best: Segment | null = null;
    for (const s of this.segments) if (s.audibleAt <= now + 0.02) best = s;
    return best ?? this.segments[0] ?? null;
  }

  private async pump(gen: number, key: number, from: number, at: number | null): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    let opened: Opened;
    try {
      opened = await this.deps.open(key, ctx);
    } catch (e) {
      if (gen !== this.gen) return;
      this.events.onError(key, message(e));
      const stop = (e instanceof PlayError && e.stop) || ++this.failures >= MAX_FAILURES;
      const next = stop ? null : this.deps.following(key, false);
      if (next === null || next === key) {
        this.endAfterLast();
        return;
      }
      return this.pump(gen, next, 0, at);
    }
    if (gen !== this.gen) {
      opened.close();
      return;
    }
    this.failures = 0;
    const start = at ?? ctx.currentTime + START_LEAD_S;
    const from_ = Math.min(from, opened.end);
    const seg: Segment = {
      key,
      zero: start - from_,
      from: from_,
      end: opened.end,
      audibleAt: start,
      endsAt: start + (opened.end - from_),
      nodes: new Set(),
      firstStart: null,
      lastEnd: null,
      done: false,
      last: false,
    };
    const prev = this.segments.at(-1);
    this.segments.push(seg);
    try {
      for await (const chunk of opened.buffers(from_)) {
        if (gen !== this.gen) break;
        const clip = clipChunk(chunk.timestamp, chunk.buffer.duration, from_, opened.end);
        if (!clip) {
          if (chunk.timestamp >= opened.end) break;
          continue;
        }
        let when = seg.zero + chunk.timestamp + clip.offset;
        let { offset, length } = clip;
        // Late (a slow disk): drop what's already past, so the rest stays on the clock.
        const late = ctx.currentTime - when;
        if (late > 0) {
          offset += late;
          length -= late;
          when = ctx.currentTime;
          if (length <= 0) continue;
        }
        const node = ctx.createBufferSource();
        node.buffer = chunk.buffer;
        if (this.volume) node.connect(this.volume);
        node.onended = () => {
          node.disconnect();
          seg.nodes.delete(node);
        };
        node.start(when, offset, length);
        seg.nodes.add(node);
        if (seg.firstStart === null) {
          seg.firstStart = when;
          if (prev?.lastEnd != null && prev.endsAt === seg.audibleAt) {
            const gapMs = (when - prev.lastEnd) * 1000;
            this.seams.push({ key, gapMs });
            if (this.seams.length > 50) this.seams.shift();
            console.debug(`[music] seam into item ${String(key)}: ${gapMs.toFixed(3)} ms`);
          }
        }
        seg.lastEnd = when + length;
        // Flat memory: at most LOOKAHEAD_S scheduled ahead, whatever the track's length.
        while (gen === this.gen && seg.lastEnd - ctx.currentTime > LOOKAHEAD_S) await sleep(POLL_MS);
      }
    } catch (e) {
      if (gen === this.gen) {
        this.events.onError(key, message(e));
        // Ends where its sound did, so the next track doesn't wait on silence.
        seg.endsAt = seg.lastEnd ?? seg.audibleAt;
      }
    } finally {
      opened.close();
    }
    if (gen !== this.gen) return;
    seg.done = true;
    this.continueAfter(gen, seg);
  }

  private continueAfter(gen: number, seg: Segment): void {
    const next = this.deps.following(seg.key, true);
    if (next === null) {
      seg.last = true;
      return;
    }
    void this.pump(gen, next, 0, seg.endsAt);
  }

  private endAfterLast(): void {
    const last = this.segments.at(-1);
    if (last) last.last = true;
    else {
      this.stopTicker();
      this.events.onEnd();
    }
  }

  private startTicker(): void {
    if (this.ticker) return;
    this.ticker = setInterval(() => {
      this.tick();
    }, POLL_MS);
  }

  private stopTicker(): void {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }

  private tick(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const seg = this.audible();
    if (!seg) return;
    if (seg.audibleAt <= ctx.currentTime + 0.02 && seg !== this.shown) {
      this.shown = seg;
      // Segments before the audible one are done with.
      this.segments = this.segments.filter((s) => s.audibleAt >= seg.audibleAt);
      this.events.onTrack(seg.key, seg.end);
    }
    if (seg.last && ctx.currentTime >= seg.endsAt) {
      this.gen++;
      this.clear();
      this.stopTicker();
      this.events.onEnd();
    }
  }
}
