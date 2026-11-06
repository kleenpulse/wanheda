// The TTS engine contract (SPEC V45). Every engine has an id and its voices.
// They then come in two kinds:
//
// - `pcm` engines (Piper in a Worker) return audio for a piece of text. The
//   speech queue schedules it on one AudioContext clock, so playback is
//   gapless and the spoken sentence is known exactly.
// - `speak` engines (Web Speech, the zero-download fallback) speak the text
//   themselves. There is no PCM, so there is no gapless or timing claim: the
//   sentence moves on each utterance's end event.

export type EngineId = "piper" | "webspeech";

/** Mono audio. Float32 in [-1, 1]. */
export interface Pcm {
  samples: Float32Array<ArrayBuffer>;
  sampleRate: number;
}

export interface SynthResult extends Pcm {
  /** Time spent synthesizing, excluding any model load: what the real-time factor is measured from. */
  synthMs: number;
}

export interface VoiceInfo {
  id: string;
  name: string;
  /** BCP 47, e.g. en-US. */
  lang: string;
}

interface EngineBase {
  id: EngineId;
  voices(): Promise<VoiceInfo[]>;
}

export interface SynthOptions {
  /** Speed, 0.5–2. Piper divides its length scale by it (no pitch shift). */
  rate: number;
  signal: AbortSignal;
}

export interface PcmEngine extends EngineBase {
  kind: "pcm";
  /** Audio for `text` in `voice`. Throws on failure; rejects with an AbortError once `signal` aborts. */
  synth(text: string, voice: string, opts: SynthOptions): Promise<SynthResult>;
}

export interface SpeakEngine extends EngineBase {
  kind: "speak";
  /** Speaks `text` and resolves when it has been spoken. Rejects with an AbortError once `signal` aborts. */
  speak(text: string, voice: string | null, opts: SynthOptions): Promise<void>;
  pause(): void;
  resume(): void;
}

export type TtsEngine = PcmEngine | SpeakEngine;

export const SPEED_MIN = 0.5;
export const SPEED_MAX = 2;

export function clampRate(rate: number): number {
  return Number.isFinite(rate) ? Math.min(SPEED_MAX, Math.max(SPEED_MIN, rate)) : 1;
}

export function abortError(): DOMException {
  return new DOMException("Speech was stopped", "AbortError");
}

export function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
