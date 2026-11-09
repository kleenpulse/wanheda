import { describe, expect, test } from "vitest";
import { CATALOG } from "../lib/speech/voices";
import { VOICE_FILES } from "./tts-catalog";
import { isVoiceId, MAX_CODEPOINTS, metadataTail, parseSynthRequest, parseTtsConfig, tokensText } from "./tts-model";

// Lessac medium's fields that matter here (its real config, trimmed).
const LESSAC = JSON.stringify({
  audio: { sample_rate: 22050 },
  espeak: { voice: "en-us" },
  inference: { noise_scale: 0.667, length_scale: 1, noise_w: 0.8 },
  language: { code: "en_US", name_english: "English" },
  num_speakers: 1,
  phoneme_id_map: { _: [0], "^": [1], $: [2], " ": [3], a: [14] },
});

/** Reads the appended entries back: field 14 → {1: key, 2: value}. */
function decode(bytes: Uint8Array): [string, string][] {
  const out: [string, string][] = [];
  let i = 0;
  const varint = () => {
    let n = 0;
    let shift = 0;
    for (;;) {
      const b = bytes[i++] ?? 0;
      n |= (b & 0x7f) << shift;
      if (b < 0x80) return n;
      shift += 7;
    }
  };
  const text = (len: number) => new TextDecoder().decode(bytes.slice(i, (i += len)));
  while (i < bytes.length) {
    expect(varint()).toBe((14 << 3) | 2);
    const end = varint() + i;
    expect(varint()).toBe((1 << 3) | 2);
    const key = text(varint());
    expect(varint()).toBe((2 << 3) | 2);
    const value = text(varint());
    expect(i).toBe(end);
    out.push([key, value]);
  }
  return out;
}

describe("metadataTail", () => {
  test("the seven entries sherpa needs, as ONNX metadata_props (131 bytes for lessac medium)", () => {
    const config = parseTtsConfig(LESSAC);
    expect(config).not.toBeNull();
    if (!config) return;
    const tail = metadataTail(config);
    // The spike's derived lessac model (5efe09… → ea793a…) has exactly these 131 bytes appended.
    expect(tail.length).toBe(131);
    expect(decode(tail)).toEqual([
      ["model_type", "vits"],
      ["comment", "piper"],
      ["language", "English"],
      ["voice", "en-us"],
      ["has_espeak", "1"],
      ["n_speakers", "1"],
      ["sample_rate", "22050"],
    ]);
  });
});

describe("tokensText", () => {
  test("each symbol with its first id, one per line, space included", () => {
    const config = parseTtsConfig(LESSAC);
    expect(config && tokensText(config)).toBe("_ 0\n^ 1\n$ 2\n  3\na 14\n");
  });
});

describe("parseTtsConfig", () => {
  test("refuses what native Piper can't run", () => {
    const base = JSON.parse(LESSAC) as Record<string, unknown>;
    for (const bad of [
      { ...base, audio: { sample_rate: 0 } },
      { ...base, inference: { noise_scale: "x", length_scale: 1, noise_w: 1 } },
      { ...base, phoneme_id_map: { a: [] } },
      { ...base, phoneme_id_map: { a: [-1] } },
      { ...base, espeak: { voice: "en-us; rm" } },
    ]) {
      expect(parseTtsConfig(JSON.stringify(bad)), JSON.stringify(bad).slice(0, 60)).toBeNull();
    }
    expect(parseTtsConfig("{broken")).toBeNull();
  });
});

describe("the catalog", () => {
  test("is the web's, voice for voice and digest for digest", () => {
    const web = Object.fromEntries(CATALOG.map((v) => [v.id, { model: { size: v.model.size, sha256: v.model.sha256 }, config: { size: v.config.size, sha256: v.config.sha256 } }]));
    expect(VOICE_FILES).toEqual(web);
  });

  test("voice ids are the catalog's only", () => {
    expect(isVoiceId("en_US-lessac-medium")).toBe(true);
    expect(isVoiceId("../x")).toBe(false);
    expect(isVoiceId("toString")).toBe(false);
  });
});

describe("parseSynthRequest", () => {
  const ok = { voice: "en_US-lessac-medium", codepoints: [104, 601], rate: 1 };

  test("a well-formed request", () => {
    expect(parseSynthRequest(ok)).toEqual(ok);
  });

  test("anything off drops it", () => {
    for (const bad of [
      { ...ok, voice: "nope" },
      { ...ok, rate: 3 },
      { ...ok, rate: Number.NaN },
      { ...ok, codepoints: [] },
      { ...ok, codepoints: [0] },
      { ...ok, codepoints: [1.5] },
      { ...ok, codepoints: [0x110000] },
      { ...ok, codepoints: Array.from({ length: MAX_CODEPOINTS + 1 }, () => 97) },
    ]) {
      expect(parseSynthRequest(bad), JSON.stringify(bad).slice(0, 60)).toBeNull();
    }
  });
});
