import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { abortError, type SynthResult } from "./engine";
import { SpeechQueue, type AudioSink, type QueueLogEntry, type Slot } from "./queue";
import { UNIT_MAX } from "./units";

// SPEC V47's gap test (T54): a fake engine whose synthesis takes 0.4 × the
// audio it makes, audio = characters ÷ 15 s, on fake timers. Every gap between
// consecutive units must stay ≤ 50 ms.

const RATE = 1000; // samples per second: small arrays, same arithmetic
const CHARS_PER_SECOND = 15;

interface Played {
  text: string;
  start: number;
  end: number;
  stopped: boolean;
}

function rig(opts: { rtf?: number } = {}) {
  const rtf = opts.rtf ?? 0.4;
  const t0 = Date.now();
  const played: Played[] = [];
  const synthCalls: string[] = [];
  /** Syntheses that finished (an aborted one isn't here). */
  const synthDone: string[] = [];
  const sentenceEvents: number[] = [];
  const log: QueueLogEntry[] = [];
  let ended = 0;
  const texts = new Map<Float32Array, string>();
  const sink: AudioSink = {
    now: () => (Date.now() - t0) / 1000,
    play(pcm, at): Slot {
      const p: Played = { text: texts.get(pcm.samples) ?? "", start: at, end: at + pcm.samples.length / pcm.sampleRate, stopped: false };
      played.push(p);
      return {
        start: p.start,
        end: p.end,
        stop: () => {
          p.stopped = true;
        },
      };
    },
  };
  const queue = new SpeechQueue({
    sink,
    synth: (text, rate, signal) =>
      new Promise<SynthResult>((resolve, reject) => {
        synthCalls.push(text);
        const audio = text.length / CHARS_PER_SECOND / rate;
        const samples = new Float32Array(Math.round(audio * RATE));
        texts.set(samples, text);
        const t = setTimeout(() => {
          synthDone.push(text);
          resolve({ samples, sampleRate: RATE, synthMs: rtf * audio * 1000 });
        }, rtf * audio * 1000);
        signal.addEventListener("abort", () => {
          clearTimeout(t);
          reject(abortError());
        });
      }),
    onSentence: (i) => sentenceEvents.push(i),
    onEnd: () => {
      ended++;
    },
    onError: (e) => {
      throw e;
    },
    log: (e) => log.push(e),
  });
  /** Gaps between consecutive units that really played (not stopped before they started). */
  const gaps = () => {
    const heard = played.filter((p) => !p.stopped).sort((a, b) => a.start - b.start);
    return heard.slice(1).map((p, i) => p.start - heard[i]!.end);
  };
  return { queue, played, synthCalls, synthDone, sentenceEvents, log, gaps, ended: () => ended, now: sink.now };
}

/** A long sentence of plain words with a few commas, `n` characters. */
function longSentence(n: number, seed = "word"): string {
  const words: string[] = [];
  let len = 0;
  for (let i = 0; len < n + seed.length; i++) {
    const w = i % 9 === 8 ? `${seed},` : seed;
    words.push(w);
    len += w.length + 1;
  }
  return `${words.join(" ").slice(0, n - 1).replace(/[ ,]$/, "x")}.`;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("gapless (V47)", () => {
  it("a 420-character sentence plays without a gap", async () => {
    const r = rig();
    const sentence = longSentence(420);
    expect(sentence.length).toBe(420);
    r.queue.start([sentence], 0, 1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(r.ended()).toBe(1);
    expect(r.played.length).toBeGreaterThan(2);
    expect(r.played.map((p) => p.text).join(" ")).toBe(sentence);
    expect(Math.max(...r.gaps())).toBeLessThanOrEqual(0.05);
    expect(r.queue.stats().underruns).toBe(0);
  });

  it("long, Yes., No., long plays without a gap", async () => {
    const r = rig();
    const sentences = [longSentence(420, "alpha"), "Yes.", "No.", longSentence(420, "omega")];
    r.queue.start(sentences, 0, 1);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(r.ended()).toBe(1);
    expect(Math.max(...r.gaps())).toBeLessThanOrEqual(0.05);
    expect(r.sentenceEvents).toEqual([0, 1, 2, 3]);
  });

  it("units ramp 60 → 120 → 200 after play, and never hold two sentences", async () => {
    const r = rig();
    r.queue.start([longSentence(600), "Second one."], 0, 1);
    await vi.advanceTimersByTimeAsync(120_000);
    const lengths = r.synthCalls.map((t) => t.length);
    expect(lengths[0]).toBeLessThanOrEqual(60);
    expect(lengths[1]).toBeLessThanOrEqual(120);
    expect(lengths[1]).toBeGreaterThan(60);
    for (const l of lengths) expect(l).toBeLessThanOrEqual(UNIT_MAX);
    expect(r.synthCalls.at(-1)).toBe("Second one.");
  });

  it("a slow tab keeps small units (RTF 0.9: caps stay at the floor)", async () => {
    const r = rig({ rtf: 0.9 });
    r.queue.start([longSentence(400)], 0, 1);
    await vi.advanceTimersByTimeAsync(120_000);
    // The measured RTF pulls the ramp down: by the third unit the caps are back near the floor.
    for (const l of r.synthCalls.slice(2).map((t) => t.length)) expect(l).toBeLessThanOrEqual(80);
  });
});

describe("long words up to RTF 0.7 (T58 review: guards V47's 60-character first unit)", () => {
  // A shorter first unit (tried in T58, reverted) gapped here from RTF 0.6: too little audio queued for the units after it.
  const cases = [
    ["Roland looked at the incomprehensible mechanisms scattered across the workbench and sighed.", "Then he went home."],
    [
      "Unquestionably, the extraordinary circumstances surrounding the investigation demanded responsibility.",
      "His Royal Highness Prince Roland Wimbledon contemplated the electromagnetic phenomenon thoughtfully afterwards.",
    ],
    ["Notwithstanding his considerable misunderstandings, the administration continued regardless of everything.", "Then he went home."],
  ];
  for (const rtf of [0.4, 0.6, 0.7]) {
    it(`no gap and no underrun at RTF ${String(rtf)}`, async () => {
      for (const sentences of cases) {
        const r = rig({ rtf });
        r.queue.start(sentences, 0, 1);
        await vi.advanceTimersByTimeAsync(120_000);
        expect(r.ended()).toBe(1);
        expect(Math.max(...r.gaps())).toBeLessThanOrEqual(0.05);
        expect(r.log.some((e) => e.kind === "unit" && e.underrun)).toBe(false);
      }
    });
  }
});

describe("the gap check can fail", () => {
  it("at RTF 1.2 the audio runs dry, and the queue counts it", async () => {
    const r = rig({ rtf: 1.2 });
    r.queue.start([longSentence(420)], 0, 1);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(Math.max(...r.gaps())).toBeGreaterThan(0.05);
    expect(r.queue.stats().underruns).toBeGreaterThan(0);
    expect(r.queue.stats().maxGapMs).toBeGreaterThan(50);
  });
});

describe("exit log (V50, T58)", () => {
  it("logs every unit with its gap, and every sentence switch with its lateness", async () => {
    const r = rig();
    r.queue.start([longSentence(300, "alpha"), "Short one.", longSentence(200, "omega")], 0, 1);
    await vi.advanceTimersByTimeAsync(120_000);
    const units = r.log.flatMap((e) => (e.kind === "unit" ? [e] : []));
    const switches = r.log.flatMap((e) => (e.kind === "sentence" ? [e] : []));
    expect(units).toHaveLength(r.played.length);
    expect(units[0]?.gapMs).toBeNull();
    expect(units[0]?.synthMs).toBeGreaterThan(0);
    for (const u of units.slice(1)) {
      expect(u.gapMs).not.toBeNull();
      expect(u.gapMs).toBeLessThanOrEqual(50);
      expect(u.underrun).toBe(false);
    }
    expect(switches.map((e) => e.sentence)).toEqual([0, 1, 2]);
    // The tick runs every 50 ms: a switch is announced at most one tick after its audio began.
    for (const e of switches) {
      expect(e.lateMs).toBeGreaterThanOrEqual(0);
      expect(e.lateMs).toBeLessThanOrEqual(50);
    }
  });

  it("flags an underrun, and a seek's first unit has no gap", async () => {
    const r = rig({ rtf: 1.2 });
    r.queue.start([longSentence(420)], 0, 1);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(r.log.some((e) => e.kind === "unit" && e.underrun)).toBe(true);

    const s = rig();
    s.queue.start(["One sentence here.", "Two sentence here.", "Three sentence here."], 0, 1);
    await vi.advanceTimersByTimeAsync(500);
    s.queue.seek(2);
    await vi.advanceTimersByTimeAsync(10_000);
    const afterSeek = s.log.filter((e) => e.kind === "unit" && e.sentence === 2);
    expect(afterSeek.at(-1)).toMatchObject({ gapMs: null });
  });
});

describe("prefetch", () => {
  it("stops synthesizing once 12 s are queued", async () => {
    const r = rig();
    const many = Array.from({ length: 40 }, (_, i) => `This is sentence number ${String(i)} of the chapter.`);
    r.queue.start(many, 0, 1);
    await vi.advanceTimersByTimeAsync(10_000);
    const queuedAhead = r.played.filter((p) => p.end > r.now()).reduce((s, p) => s + p.end - Math.max(p.start, r.now()), 0);
    expect(queuedAhead).toBeGreaterThanOrEqual(10);
    expect(queuedAhead).toBeLessThan(16);
    expect(r.synthCalls.length).toBeLessThan(40);
  });
});

describe("controls", () => {
  it("seek aborts pending synthesis and drops queued audio", async () => {
    const r = rig();
    const many = Array.from({ length: 20 }, (_, i) => `Sentence ${String(i)} has a few words in it.`);
    r.queue.start(many, 0, 1);
    await vi.advanceTimersByTimeAsync(3_000);
    r.queue.seek(15);
    const stoppedNow = r.played.filter((p) => p.stopped).length;
    expect(stoppedNow).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(r.sentenceEvents.at(-1)).toBe(15);
  });

  it("next and prev reuse cached audio instead of synthesizing again", async () => {
    const r = rig();
    const many = Array.from({ length: 10 }, (_, i) => `Sentence ${String(i)} has a few words in it.`);
    r.queue.start(many, 0, 1);
    await vi.advanceTimersByTimeAsync(5_000);
    const made = r.synthDone.slice();
    const calls = r.synthCalls.length;
    const beforeNext = r.played.length;
    r.queue.next();
    const afterNext = r.played.length;
    r.queue.prev();
    // Prefetch may go further ahead, but nothing already made is made again.
    for (const text of r.synthCalls.slice(calls)) expect(made).not.toContain(text);
    // Both play at once: their first unit starts within the lead, not after a synthesis.
    for (const first of [r.played[beforeNext]!, r.played[afterNext]!]) {
      expect(first.start - r.now()).toBeLessThanOrEqual(0.05);
    }
  });

  it("stop ends everything and a late result is never played", async () => {
    const r = rig();
    r.queue.start([longSentence(300)], 0, 1);
    await vi.advanceTimersByTimeAsync(100);
    r.queue.stop();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(r.played.length).toBe(0);
    expect(r.ended()).toBe(0);
  });

  it("a new rate keeps the playing unit and synthesizes the rest again", async () => {
    const r = rig();
    const many = Array.from({ length: 10 }, (_, i) => `Sentence ${String(i)} has a few words in it.`);
    r.queue.start(many, 0, 1);
    await vi.advanceTimersByTimeAsync(4_000);
    const before = r.synthCalls.length;
    const playing = r.played.find((p) => p.start <= r.now() && p.end > r.now());
    r.queue.setRate(2);
    expect(playing?.stopped).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(r.synthCalls.length).toBeGreaterThan(before);
    expect(r.ended()).toBe(1);
  });
});
