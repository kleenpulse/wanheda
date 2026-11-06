import { create } from "zustand";
import { clampRate, isAbort, type EngineId } from "./engine";
import { piper } from "./piper";
import { SpeechPlayer } from "./player";
import { SpeechQueue, type QueueStats } from "./queue";
import { DEFAULT_VOICE, isInstalled } from "./voices";
import { webSpeech, webSpeechAvailable } from "./web-speech";

// The speech store (SPEC V47, V49): one per tab, the one place speech is
// started, steered and stopped. The reader, the island's speech card and the
// mini window (T56, T57) all drive this.
//
// - Controls never wait on the engine: state changes at once and the engine
//   catches up (V49).
// - One speaking tab per device: speaking holds the Web Lock
//   `wanheda-speech`, taken with `steal`, so play in another tab stops this one.
// - Engine: Piper when its voice is on this device, else the browser's Web
//   Speech. If Piper fails mid-way, Web Speech carries on from the sentence.

export interface SpeechSource {
  kind: "doc" | "note";
  /** The document's sha256, or the note's id. */
  id: string;
  title: string;
}

export type SpeechStatus = "idle" | "playing" | "paused";

interface SpeechState {
  status: SpeechStatus;
  /** Between play (or seek) and its first audio: the engine is loading or synthesizing. */
  waiting: boolean;
  source: SpeechSource | null;
  /** The sentence being spoken (at once after a seek, before its audio starts). */
  sentence: number;
  total: number;
  rate: number;
  /** The Piper voice to use when it's on this device. */
  voice: string;
  engine: EngineId | null;
  error: string | null;

  play: (source: SpeechSource, sentences: readonly string[], from?: number) => void;
  pause: () => void;
  resume: () => void;
  toggle: () => void;
  stop: () => void;
  next: () => void;
  prev: () => void;
  seek: (sentence: number) => void;
  setRate: (rate: number) => void;
}

interface Driver {
  readonly engine: EngineId;
  /** Starts at `from`; `paused` (the owner paused before the engine was ready) starts without a sound. */
  start(sentences: readonly string[], from: number, rate: number, paused: boolean): void;
  seek(i: number): void;
  setRate(rate: number): void;
  pause(): void;
  resume(): void;
  stop(): void;
}

interface DriverEvents {
  onSentence(i: number): void;
  onEnd(): void;
  onError(error: unknown): void;
}

class PiperDriver implements Driver {
  readonly engine = "piper";
  private readonly queue: SpeechQueue;
  private readonly unhold = piper.hold();

  constructor(
    private readonly player: SpeechPlayer,
    voice: string,
    events: DriverEvents,
  ) {
    this.queue = new SpeechQueue({
      sink: player,
      synth: (text, rate, signal) => piper.synth(text, voice, { rate, signal }),
      ...events,
    });
  }

  stats(): QueueStats {
    return this.queue.stats();
  }

  start(sentences: readonly string[], from: number, rate: number, paused: boolean): void {
    if (paused) this.player.pause();
    else this.player.resume();
    this.queue.start(sentences, from, rate);
  }
  seek(i: number): void {
    this.queue.seek(i);
  }
  setRate(rate: number): void {
    this.queue.setRate(rate);
  }
  pause(): void {
    this.player.pause();
  }
  resume(): void {
    this.player.resume();
  }
  stop(): void {
    this.queue.stop();
    this.unhold();
  }
}

class WebSpeechDriver implements Driver {
  readonly engine = "webspeech";
  private ctrl: AbortController | null = null;
  private sentences: readonly string[] = [];
  private rate = 1;
  private current = 0;
  private paused = false;
  /** A seek or new rate while paused: where to start on resume (speaking now would unpause the voice). */
  private pendingFrom: number | null = null;

  constructor(private readonly events: DriverEvents) {}

  start(sentences: readonly string[], from: number, rate: number, paused: boolean): void {
    this.sentences = sentences;
    this.rate = rate;
    this.paused = paused;
    this.run(from);
  }
  seek(i: number): void {
    this.run(i);
  }
  /** An utterance can't change speed mid-way: the sentence starts over at the new rate. */
  setRate(rate: number): void {
    this.rate = rate;
    if (this.ctrl || this.pendingFrom !== null) this.run(this.pendingFrom ?? this.current);
  }
  pause(): void {
    this.paused = true;
    webSpeech.pause();
  }
  resume(): void {
    this.paused = false;
    const from = this.pendingFrom;
    if (from === null) {
      webSpeech.resume();
      return;
    }
    this.pendingFrom = null;
    this.run(from);
  }
  stop(): void {
    this.ctrl?.abort();
    this.ctrl = null;
    this.pendingFrom = null;
  }

  private run(from: number): void {
    this.ctrl?.abort();
    this.ctrl = null;
    if (this.paused) {
      this.pendingFrom = from;
      this.current = from;
      this.events.onSentence(from);
      return;
    }
    const ctrl = new AbortController();
    this.ctrl = ctrl;
    // The aborted utterance may have left the synthesizer paused: a new one must start.
    webSpeech.resume();
    void (async () => {
      for (let i = Math.max(0, from); i < this.sentences.length; i++) {
        if (ctrl.signal.aborted) return;
        this.current = i;
        this.events.onSentence(i);
        try {
          await webSpeech.speak(this.sentences[i] ?? "", null, { rate: this.rate, signal: ctrl.signal });
        } catch (error) {
          if (!isAbort(error) && !ctrl.signal.aborted) this.events.onError(error);
          return;
        }
      }
      if (!ctrl.signal.aborted) {
        this.ctrl = null;
        this.events.onEnd();
      }
    })();
  }
}

// ── Web Lock: one speaking tab per device ────────────────────────────────

const LOCK = "wanheda-speech";
let lock: { release: () => void } | null = null;

function takeLock(onLost: () => void): void {
  if (lock || typeof navigator === "undefined" || !("locks" in navigator)) return;
  const holder = { release: (): void => undefined };
  lock = holder;
  navigator.locks
    .request(LOCK, { steal: true }, () =>
      new Promise<void>((resolve) => {
        holder.release = resolve;
        // Released before the lock was granted.
        if (lock !== holder) resolve();
      }),
    )
    .catch(() => {
      // Stolen: another tab started speaking.
      if (lock !== holder) return;
      lock = null;
      onLost();
    });
}

function releaseLock(): void {
  const held = lock;
  lock = null;
  held?.release();
}

// ── The store ────────────────────────────────────────────────────────────

const player = new SpeechPlayer();
let driver: Driver | null = null;
let sentences: readonly string[] = [];
/** Bumped by every play and stop: an engine choice that resolves late for an older play is dropped. */
let generation = 0;

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const useSpeech = create<SpeechState>()((set, get) => {
  const events = (gen: number): DriverEvents => ({
    onSentence: (i) => {
      if (gen === generation) set({ sentence: i, waiting: false });
    },
    onEnd: () => {
      if (gen !== generation) return;
      finish();
      set({ status: "idle", waiting: false });
    },
    onError: (error) => {
      if (gen !== generation) return;
      const failed = driver;
      failed?.stop();
      driver = null;
      if (failed?.engine === "piper" && webSpeechAvailable()) {
        // Piper failed (voice missing, engine crashed): the browser voice carries on from here.
        driver = new WebSpeechDriver(events(gen));
        set({ engine: "webspeech", error: `Piper stopped (${message(error)}); using the browser voice.` });
        driver.start(sentences, get().sentence, get().rate, get().status === "paused");
        return;
      }
      finish();
      set({ status: "idle", waiting: false, error: message(error) });
    },
  });

  const finish = () => {
    driver?.stop();
    driver = null;
    releaseLock();
  };

  const stop = () => {
    generation++;
    finish();
    set({ status: "idle", waiting: false, source: null, sentence: 0, total: 0, engine: null });
  };

  return {
    status: "idle",
    waiting: false,
    source: null,
    sentence: 0,
    total: 0,
    rate: 1,
    voice: DEFAULT_VOICE,
    engine: null,
    error: null,

    play: (source, list, from = 0) => {
      generation++;
      const gen = generation;
      finish();
      sentences = list;
      const start = Math.min(Math.max(0, Math.floor(from)), Math.max(0, list.length - 1));
      if (list.length === 0) {
        set({ status: "idle", waiting: false, source, sentence: 0, total: 0, engine: null, error: "Nothing to read here." });
        return;
      }
      // In the click's turn: the browser lets the audio context run.
      player.unlock();
      set({ status: "playing", waiting: true, source, sentence: start, total: list.length, error: null });
      takeLock(() => {
        if (gen !== generation) return;
        generation++;
        driver?.stop();
        driver = null;
        set({ status: "idle", waiting: false, error: null });
      });
      void isInstalled(get().voice)
        .catch(() => false)
        .then((hasPiper) => {
          if (gen !== generation) return;
          // Read now, not at the press: a speed change during the check must not be lost.
          const { voice, rate } = get();
          if (!hasPiper && !webSpeechAvailable()) {
            finish();
            set({ status: "idle", waiting: false, engine: null, error: "No voice: download one in Settings, or use a browser with speech." });
            return;
          }
          driver = hasPiper ? new PiperDriver(player, voice, events(gen)) : new WebSpeechDriver(events(gen));
          set({ engine: driver.engine });
          const { sentence, status } = get();
          driver.start(sentences, sentence, rate, status === "paused");
        });
    },

    pause: () => {
      if (get().status !== "playing") return;
      set({ status: "paused" });
      driver?.pause();
    },

    resume: () => {
      if (get().status !== "paused") return;
      set({ status: "playing" });
      player.unlock();
      driver?.resume();
    },

    toggle: () => {
      const { status } = get();
      if (status === "playing") get().pause();
      else if (status === "paused") get().resume();
    },

    stop,

    next: () => {
      get().seek(get().sentence + 1);
    },

    prev: () => {
      get().seek(get().sentence - 1);
    },

    seek: (i) => {
      const { status, total } = get();
      if (status === "idle") return;
      if (i >= total) {
        generation++;
        finish();
        set({ status: "idle", waiting: false });
        return;
      }
      const target = Math.max(0, Math.floor(i));
      set({ sentence: target, waiting: true });
      driver?.seek(target);
    },

    setRate: (rate) => {
      const r = clampRate(rate);
      set({ rate: r });
      driver?.setRate(r);
    },
  };
});

/** The Piper queue's numbers for the current speech (exit log, V50), or null on Web Speech or idle. */
export function speechStats(): QueueStats | null {
  return driver instanceof PiperDriver ? driver.stats() : null;
}
