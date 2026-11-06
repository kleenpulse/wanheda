import { abortError, type SpeakEngine, type SynthOptions, type VoiceInfo } from "./engine";

// The Web Speech engine (SPEC V45): the zero-download fallback, the voice
// that works with no setup (and in demo mode). The browser speaks; there is
// no PCM, so there is no gapless or timing claim. Each sentence is one
// utterance and the highlight moves on its end event.

export function webSpeechAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance === "function";
}

function pickVoice(id: string | null): SpeechSynthesisVoice | null {
  const all = speechSynthesis.getVoices();
  if (id) {
    const exact = all.find((v) => v.voiceURI === id);
    if (exact) return exact;
  }
  const lang = navigator.language.toLowerCase();
  return all.find((v) => v.default && v.lang.toLowerCase() === lang) ?? all.find((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2))) ?? null;
}

export const webSpeech: SpeakEngine = {
  kind: "speak",
  id: "webspeech",

  voices(): Promise<VoiceInfo[]> {
    if (!webSpeechAvailable()) return Promise.resolve([]);
    return Promise.resolve(speechSynthesis.getVoices().map((v) => ({ id: v.voiceURI, name: v.name, lang: v.lang })));
  },

  speak(text: string, voice: string | null, { rate, signal }: SynthOptions): Promise<void> {
    if (!webSpeechAvailable()) return Promise.reject(new Error("this browser has no speech synthesis"));
    if (signal.aborted) return Promise.reject(abortError());
    return new Promise<void>((resolve, reject) => {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = rate;
      const v = pickVoice(voice);
      if (v) {
        u.voice = v;
        u.lang = v.lang;
      }
      const onAbort = () => {
        speechSynthesis.cancel();
        reject(abortError());
      };
      u.onend = () => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      };
      u.onerror = (e) => {
        signal.removeEventListener("abort", onAbort);
        // A cancel (ours, or another speaker taking over) ends the utterance as "interrupted" or "canceled".
        reject(e.error === "interrupted" || e.error === "canceled" ? abortError() : new Error(`speech failed: ${e.error}`));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      speechSynthesis.speak(u);
    });
  },

  pause(): void {
    if (webSpeechAvailable()) speechSynthesis.pause();
  },

  resume(): void {
    if (webSpeechAvailable()) speechSynthesis.resume();
  },
};
