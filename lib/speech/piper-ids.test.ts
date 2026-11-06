import { describe, expect, it } from "vitest";
import { parseVoiceConfig, phonemeIds, punctuationPhonemes, textToPhonemes, type PhonemeIdMap } from "./piper-ids";

// A fake phonemizer: words become their lowercase letters, so the punctuation handling is what's visible.
const fake = (text: string) => Promise.resolve(text.trim().toLowerCase().split(/\s+/));

const MAP: PhonemeIdMap = { _: [0], "^": [1], $: [2], " ": [3], ",": [8], ".": [10], a: [14], b: [15], "ˈ": [120], "̃": [141] };

describe("textToPhonemes", () => {
  it("keeps clause punctuation between phonemized words", async () => {
    expect(await textToPhonemes("Hello, World.", fake)).toBe("hello, world.");
  });

  it("drops marks Piper has no ids for, keeping a space", async () => {
    expect(await textToPhonemes("say “hi” now", fake)).toBe("say hi now");
    expect(await textToPhonemes("wait — what?", fake)).toBe("wait what?");
  });

  it("text that is all punctuation phonemizes to nothing", async () => {
    expect(await textToPhonemes("...", fake)).toBe(".");
    expect(punctuationPhonemes(" () ")).toBe(" ");
  });
});

describe("phonemeIds", () => {
  it("wraps ids in BOS and EOS with a pad after BOS and after every phoneme", () => {
    expect(phonemeIds("ab.", MAP)).toEqual([1, 0, 14, 0, 15, 0, 10, 0, 2]);
  });

  it("splits into code points after NFD (a precomposed ã becomes a + tilde)", () => {
    expect(phonemeIds("ã", MAP)).toEqual([1, 0, 14, 0, 141, 0, 2]);
  });

  it("drops unknown phonemes and counts them", () => {
    const missing = new Map<string, number>();
    expect(phonemeIds("aza", MAP, missing)).toEqual([1, 0, 14, 0, 14, 0, 2]);
    expect(missing.get("z")).toBe(1);
  });

  it("refuses a map without BOS, EOS or pad", () => {
    expect(() => phonemeIds("a", { a: [1] })).toThrow();
  });
});

describe("parseVoiceConfig", () => {
  const ok = { audio: { sample_rate: 22050 }, inference: { noise_scale: 0.667, length_scale: 1, noise_w: 0.8 }, num_speakers: 1, phoneme_id_map: MAP };

  it("reads a Piper voice config", () => {
    expect(parseVoiceConfig(ok)?.audio.sample_rate).toBe(22050);
  });

  it("refuses what Piper can't run", () => {
    expect(parseVoiceConfig(null)).toBeNull();
    expect(parseVoiceConfig({ ...ok, audio: { sample_rate: 0 } })).toBeNull();
    expect(parseVoiceConfig({ ...ok, inference: { noise_scale: "x", length_scale: 1, noise_w: 1 } })).toBeNull();
    expect(parseVoiceConfig({ ...ok, phoneme_id_map: { a: [1] } })).toBeNull();
  });

  it("phonemizes with the espeak voice the model was trained on, en-us when the config has none", () => {
    expect(parseVoiceConfig(ok)?.espeak.voice).toBe("en-us");
    expect(parseVoiceConfig({ ...ok, espeak: { voice: "en-gb-x-rp" } })?.espeak.voice).toBe("en-gb-x-rp");
    expect(parseVoiceConfig({ ...ok, espeak: { voice: "en" }, phoneme_type: "espeak" })?.espeak.voice).toBe("en");
  });

  it("refuses a voice the bundled phonemizer can't speak, or one that isn't phoneme-based", () => {
    expect(parseVoiceConfig({ ...ok, espeak: { voice: "de" } })).toBeNull();
    expect(parseVoiceConfig({ ...ok, espeak: { voice: 7 } })).toBeNull();
    expect(parseVoiceConfig({ ...ok, phoneme_type: "text" })).toBeNull();
  });
});
