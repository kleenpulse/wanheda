import type { Pcm } from "./engine";
import type { AudioSink, Slot } from "./queue";

// Where speech plays (SPEC V47): one AudioContext, its clock the one units
// are scheduled on. Ported from companion-tts `player.ts`'s graph, moved from
// an <audio> element to buffers scheduled back to back:
//
//   buffer sources → limiter → gain (volume) → analyser → destination
//
// The limiter rides peaks that would clip; the analyser feeds a waveform
// (island, T57). Pause suspends the context, so the clock and every
// scheduled buffer stop together and resume in step.

export class SpeechPlayer implements AudioSink {
  private ctx: AudioContext | null = null;
  private input: AudioNode | null = null;
  private gain: GainNode | null = null;
  analyser: AnalyserNode | null = null;
  private volume = 1;

  /** Builds the graph. Call from a user gesture (play), so the browser lets the context run. */
  unlock(): void {
    const ctx = this.ensure();
    if (ctx.state === "suspended") void ctx.resume();
  }

  private ensure(): AudioContext {
    if (this.ctx && this.ctx.state !== "closed") return this.ctx;
    const ctx = new AudioContext({ latencyHint: "playback" });
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.1;
    const gain = ctx.createGain();
    gain.gain.value = this.volume;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.7;
    // The analyser must chain to the destination, or the audio goes silent.
    limiter.connect(gain);
    gain.connect(analyser);
    analyser.connect(ctx.destination);
    this.ctx = ctx;
    this.input = limiter;
    this.gain = gain;
    this.analyser = analyser;
    return ctx;
  }

  now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  play(pcm: Pcm, at: number): Slot {
    const ctx = this.ensure();
    const buffer = ctx.createBuffer(1, Math.max(1, pcm.samples.length), pcm.sampleRate);
    buffer.copyToChannel(pcm.samples, 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    if (this.input) src.connect(this.input);
    // Played (or stopped): the node lets go of its buffer.
    src.onended = () => {
      src.disconnect();
    };
    src.start(at);
    return {
      start: at,
      end: at + buffer.duration,
      stop: () => {
        try {
          src.stop();
        } catch {
          // Never started: nothing to stop.
        }
        src.disconnect();
      },
    };
  }

  // Not gated on `state`: a resume still in flight reads "suspended", and a
  // pause right after it must still win. The context applies them in order.
  pause(): void {
    if (this.ctx && this.ctx.state !== "closed") void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state !== "closed") void this.ctx.resume();
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.gain) this.gain.gain.value = this.volume;
  }

  /** Frees the audio device. The next play builds a new graph. */
  close(): void {
    const ctx = this.ctx;
    this.ctx = null;
    this.input = null;
    this.gain = null;
    this.analyser = null;
    if (ctx && ctx.state !== "closed") void ctx.close();
  }
}
