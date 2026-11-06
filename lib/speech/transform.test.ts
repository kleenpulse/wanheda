import { describe, expect, it } from "vitest";
import { fixMojibake, speakableSentences } from "./transform";

// Ported from companion-tts transform.test.ts; the cap and chunk cases are
// gone with the cap and the packing, sentence cases are new (V47).

const one = (raw: string) => speakableSentences(raw).join(" ");

describe("mojibake", () => {
  it("repairs the known Windows-1252 sequences", () => {
    expect(fixMojibake("wait â€” really â€œyesâ€™")).toBe("wait — really \"yes'");
    expect(fixMojibake("cafÃ© rÃ©sumÃ©")).toBe("café résumé");
    expect(fixMojibake("loadingâ€¦")).toBe("loading…");
    expect(fixMojibake("â€œquotedâ€\u009d")).toBe('"quoted"');
  });

  it("leaves clean prose untouched", () => {
    const clean = "An em dash — and “curly quotes” survive unharmed.";
    expect(fixMojibake(clean)).toBe(clean);
  });
});

describe("code fences", () => {
  it("announces fences once", () => {
    const out = one("Before.\n```ts\nconst x = 1;\nconst y = 2;\n```\nAfter.");
    expect(out).toBe("Before. Code block. After.");
  });

  it("collapses consecutive fences", () => {
    const out = one("A.\n```\nx\n```\n```\ny\n```\nB.");
    expect(out.match(/Code block\./g)?.length).toBe(1);
  });

  it("drops fence content when announceCode is off", () => {
    const out = speakableSentences("Hi.\n```\nsecret\n```\nBye.", { announceCode: false }).join(" ");
    expect(out).toBe("Hi. Bye.");
  });

  it("cuts everything after an unterminated fence", () => {
    const out = one("Real words.\n```\nnever closed\nmore code");
    expect(out).not.toContain("never closed");
    expect(out).toContain("Real words.");
  });
});

describe("structure", () => {
  it("tables become one phrase", () => {
    const out = one("Data:\n| a | b |\n|---|---|\n| 1 | 2 |\nDone.");
    expect(out).toContain("Table omitted.");
    expect(out).not.toContain("| a |");
  });

  it("headers become sentences", () => {
    expect(speakableSentences("## The Plan\nWe act now.")).toEqual(["The Plan.", "We act now."]);
  });

  it("bullets flatten with terminal punctuation", () => {
    expect(speakableSentences("- First thing\n- Second thing.")).toEqual(["First thing.", "Second thing."]);
    // The sentence segmenter (UAX #29) doesn't break before a lowercase word: one sentence, read with its pauses.
    expect(speakableSentences("- first thing\n- second thing.")).toEqual(["first thing. second thing."]);
  });

  it("blockquotes lose their markers", () => {
    expect(one("> quoted wisdom here.")).toBe("quoted wisdom here.");
  });

  it("a paragraph without punctuation still ends its sentence", () => {
    expect(speakableSentences("Shopping list\n\nBuy bread today.")).toEqual(["Shopping list.", "Buy bread today."]);
  });

  it("a line wrapped inside a paragraph stays one sentence", () => {
    expect(speakableSentences("This sentence wraps\nonto a second line.")).toEqual(["This sentence wraps onto a second line."]);
  });
});

describe("inline", () => {
  it("links keep their text, bare urls become hostnames", () => {
    expect(one("See [the docs](https://example.com/x) at https://www.example.org/v1/tts.")).toBe("See the docs at example.org.");
  });

  it("inline code keeps content", () => {
    expect(one("Run `bun install` now.")).toBe("Run bun install now.");
  });

  it("file paths shrink to basenames", () => {
    expect(one("Edited D:\\projects\\my-app\\components\\shell\\PillTabs.tsx today.")).toBe("Edited PillTabs.tsx today.");
    expect(one("Check app/components/shell/TopBar.tsx please.")).toBe("Check TopBar.tsx please.");
  });

  it("emphasis markers vanish, arrows read as to", () => {
    expect(one("**bold** and *italic* go a → b.")).toBe("bold and italic go a to b.");
  });
});

describe("sentences", () => {
  it("splits prose into one entry per sentence", () => {
    expect(speakableSentences("One. Two! Three?")).toEqual(["One.", "Two!", "Three?"]);
  });

  it("never returns a sentence over the reader's limit", () => {
    const long = `start ${"word ".repeat(400)}end.`;
    for (const s of speakableSentences(long)) expect(s.length).toBeLessThanOrEqual(1000);
  });
});

describe("drops", () => {
  it("pure code block with announce off yields nothing", () => {
    expect(speakableSentences("```\nx\n```", { announceCode: false })).toEqual([]);
  });

  it("whitespace and symbol-only input yields nothing", () => {
    expect(speakableSentences("   \n\n  ")).toEqual([]);
    expect(speakableSentences("---")).toEqual([]);
  });

  it("ordinary prose ends with terminal punctuation", () => {
    expect(one("no punctuation here")).toBe("no punctuation here.");
  });
});
