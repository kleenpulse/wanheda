import { describe, expect, it } from "vitest";
import { pickFromDom, resolveWord, WORD_GRACE_MS, WORD_LIST, WORDS, wordDelay, type WordInputs } from "./auth-word";

const none: WordInputs = { pending: null, inBrowser: null, hovered: null, focused: null };

describe("resolveWord", () => {
  it("is WANHEDA with nothing going on", () => {
    expect(resolveWord(none)).toBe("wanheda");
  });

  it("orders pending > inBrowser > hovered > focused", () => {
    const all: WordInputs = { pending: "passkey", inBrowser: "google", hovered: "github", focused: "google" };
    expect(resolveWord(all)).toBe("passkey");
    expect(resolveWord({ ...all, pending: null })).toBe("google");
    expect(resolveWord({ ...all, pending: null, inBrowser: null })).toBe("github");
    expect(resolveWord({ ...all, pending: null, inBrowser: null, hovered: null })).toBe("google");
  });

  it("keeps the keyboard-focused word when the mouse leaves", () => {
    expect(resolveWord({ ...none, focused: "github" })).toBe("github");
  });

  it("holds the provider while the desktop app waits on the browser", () => {
    expect(resolveWord({ ...none, inBrowser: "github" })).toBe("github");
  });
});

describe("wordDelay", () => {
  it("waits only on the way home", () => {
    expect(wordDelay("wanheda")).toBe(WORD_GRACE_MS);
    expect(wordDelay("passkey")).toBe(0);
    expect(wordDelay("google")).toBe(0);
  });
});

describe("pickFromDom", () => {
  it("reads hover and focus-visible back from the buttons", () => {
    expect(
      pickFromDom([
        ["passkey", { hover: false, focusVisible: false }],
        ["github", { hover: true, focusVisible: false }],
        ["google", { hover: false, focusVisible: true }],
      ]),
    ).toEqual({ hovered: "github", focused: "google" });
  });

  it("clears both when no button holds them", () => {
    expect(pickFromDom([["github", { hover: false, focusVisible: false }]])).toEqual({ hovered: null, focused: null });
  });
});

describe("WORDS", () => {
  it("lists every word once, uppercase", () => {
    expect(WORD_LIST).toEqual(["WANHEDA", "PASSKEY", "GITHUB", "GOOGLE"]);
    for (const word of Object.values(WORDS)) expect(word).toBe(word.toUpperCase());
  });
});
