import { describe, expect, it } from "vitest";
import { bytesOf, missingVoices, offerKey, parseAccountVoices, sameVoices, strictAccountVoices, voiceNames, withVoice } from "./account-voices";
import { CATALOG, catalogVoice, voiceSize } from "./voices";

const AMY = "en_US-amy-medium";
const LESSAC = "en_US-lessac-medium";
const LESSAC_HIGH = "en_US-lessac-high";
const RYAN = "en_US-ryan-medium";

const voice = (id: string) => {
  const v = catalogVoice(id);
  if (!v) throw new Error(id);
  return v;
};

describe("parseAccountVoices", () => {
  it("keeps catalog ids once each, in catalog order", () => {
    expect(parseAccountVoices([RYAN, AMY, LESSAC, AMY])).toEqual([LESSAC, AMY, RYAN]);
  });

  it("drops unknown ids and junk", () => {
    expect(parseAccountVoices([AMY, "en_US-nobody-medium", 3, null, { id: AMY }])).toEqual([AMY]);
    for (const raw of [null, undefined, "x", 1, {}]) expect(parseAccountVoices(raw)).toEqual([]);
  });
});

describe("strictAccountVoices", () => {
  it("takes a list of distinct catalog ids", () => {
    expect(strictAccountVoices([RYAN, AMY])).toEqual([AMY, RYAN]);
    expect(strictAccountVoices([])).toEqual([]);
  });

  it("refuses any unknown id, duplicate, junk or oversize list", () => {
    expect(strictAccountVoices([AMY, "nope"])).toBeNull();
    expect(strictAccountVoices([AMY, AMY])).toBeNull();
    expect(strictAccountVoices([AMY, 1])).toBeNull();
    expect(strictAccountVoices(AMY)).toBeNull();
    expect(strictAccountVoices([...CATALOG.map((v) => v.id), AMY])).toBeNull();
  });
});

describe("withVoice", () => {
  it("adds once and removes, keeping catalog order", () => {
    expect(withVoice([RYAN], AMY, true)).toEqual([AMY, RYAN]);
    expect(withVoice([AMY, RYAN], AMY, true)).toEqual([AMY, RYAN]);
    expect(withVoice([AMY, RYAN], AMY, false)).toEqual([RYAN]);
    expect(withVoice([RYAN], "nope", true)).toEqual([RYAN]);
  });
});

describe("missingVoices", () => {
  it("is the account's voices this device neither holds nor is fetching", () => {
    const missing = missingVoices([LESSAC, AMY, RYAN], [LESSAC], [RYAN]);
    expect(missing.map((v) => v.id)).toEqual([AMY]);
  });

  it("is empty when the device has them all, or the account has none", () => {
    expect(missingVoices([AMY], [AMY, RYAN], [])).toEqual([]);
    expect(missingVoices([], [], [])).toEqual([]);
  });
});

describe("offer text", () => {
  it("adds up the sizes", () => {
    expect(bytesOf([voice(AMY), voice(RYAN)])).toBe(voiceSize(voice(AMY)) + voiceSize(voice(RYAN)));
  });

  it("names one, two and three voices", () => {
    expect(voiceNames([voice(AMY)])).toBe("Amy");
    expect(voiceNames([voice(AMY), voice(RYAN)])).toBe("Amy and Ryan");
    expect(voiceNames([voice(LESSAC), voice(AMY), voice(RYAN)])).toBe("Lessac, Amy and Ryan");
  });

  it("tells two qualities of one voice apart", () => {
    expect(voiceNames([voice(LESSAC), voice(LESSAC_HIGH)])).toBe("Lessac (medium) and Lessac (high)");
  });

  it("keys the offer by its set", () => {
    expect(offerKey([voice(AMY), voice(RYAN)])).toBe(`${AMY},${RYAN}`);
    expect(sameVoices([AMY], [AMY])).toBe(true);
    expect(sameVoices([AMY], [RYAN])).toBe(false);
  });
});
