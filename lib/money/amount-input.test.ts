import { describe, expect, it } from "vitest";
import { applyEdit, cleanPaste, currencySymbol, evaluate, group, isPlain, isValidPrefix, normalize, plainText, readAmount } from "./amount-input";

const NGN = { currency: "NGN" } as const;
const NGN_NEG = { currency: "NGN", allowNegative: true } as const;
const JPY = { currency: "JPY" } as const;

/** Types `chars` one at a time at the end of the field, as a person would. */
function typeInto(chars: string, options: Parameters<typeof applyEdit>[3] = NGN, start = ""): string {
  let text = start;
  for (const ch of chars) {
    const raw = text + ch;
    text = applyEdit(text, raw, raw.length, options, "insert").text;
  }
  return text;
}

describe("typing", () => {
  it.each([
    ["20ksfjfbjs", "20k"],
    ["1.2.3", "1.23"],
    ["12.345", "12.34"],
    ["-500", "500"],
    ["20km", "20k"],
    ["1234567", "1,234,567"],
    ["1234567.5", "1,234,567.5"],
    ["2.5k+800", "2.5k+800"],
    ["2*3", "2×3"],
    ["10/4", "10÷4"],
    ["5x2", "5×2"],
    ["NGN 20,000", "20,000"],
    ["(1+2)*3", "(1+2)×3"],
    [")", ""],
    ["5++", "5+"],
    ["1234567890123456789", "123,456,789,012,345"],
  ])("%s → %s", (typed, kept) => {
    expect(typeInto(typed)).toBe(kept);
  });

  it("allows a leading minus only when negatives are allowed", () => {
    expect(typeInto("-500", NGN_NEG)).toBe("-500");
    expect(typeInto("--5", NGN_NEG)).toBe("-5");
    expect(typeInto("5×-2", NGN_NEG)).toBe("5×-2");
    expect(typeInto("5×-2")).toBe("5×2");
  });

  it("lets a currency without decimals type a short form, and reads a bare decimal as an error", () => {
    expect(typeInto("2.5k", JPY)).toBe("2.5k");
    expect(evaluate("2.5k", "JPY")).toEqual({ minor: 2500 });
    expect(typeInto("2.5555", JPY)).toBe("2.555");
    expect(evaluate("2.5", "JPY")).toEqual({ error: "No decimals in JPY" });
  });

  it("takes a leading dot", () => {
    expect(typeInto(".5")).toBe(".5");
    expect(evaluate(".5", "NGN")).toEqual({ minor: 50 });
    expect(evaluate(".", "NGN")).toEqual({ error: "Not an amount" });
    expect(applyEdit("", ".99", 3, NGN, "paste").text).toBe(".99");
  });

  it("refuses typing over a selection that would break the amount", () => {
    // "1.5" with "5" selected, "." typed → "1.."
    expect(applyEdit("1.5", "1..", 3, NGN, "insert").text).toBe("1.5");
    // "1,234" with "1" selected, "k" typed → "k,234"
    expect(applyEdit("1,234", "k,234", 1, NGN, "insert").text).toBe("1,234");
  });

  it("keeps a junk paste as pasted, so blur shows the error instead of joining digits", () => {
    const pasted = applyEdit("", cleanPaste("1e5", false), 3, NGN, "paste");
    expect(pasted).toEqual({ text: "1e5", caret: 3 });
    expect(readAmount(pasted.text, "NGN", "positive", "x").error).toBe("Not an amount");
    expect(readAmount("abc", "NGN", "positive", "Enter an amount").error).toBe("Not an amount");
  });

  it("always lets a character be deleted, even if what is left is not an amount yet", () => {
    expect(applyEdit("5+3", "+3", 0, NGN, "delete").text).toBe("+3");
  });

  it("keeps a pasted amount whole, to be checked on blur", () => {
    expect(applyEdit("", "12.345", 6, NGN, "paste").text).toBe("12.345");
  });

  it("keeps the caret after the same digit when a comma comes or goes", () => {
    // "123|" + "4" → "1,234|"
    expect(applyEdit("123", "1234", 4, NGN, "insert")).toEqual({ text: "1,234", caret: 5 });
    // caret after "1" in "1|234" typing "0" → "10|234" → "10,234" caret 2
    expect(applyEdit("1,234", "10,234", 2, NGN, "insert")).toEqual({ text: "10,234", caret: 2 });
    // deleting the "2" from "1,2|34" → "134", caret after "1"
    expect(applyEdit("1,234", "1,34", 2, NGN, "delete")).toEqual({ text: "134", caret: 1 });
    // a refused character leaves the caret where it was
    expect(applyEdit("20k", "20ks", 4, NGN, "insert")).toEqual({ text: "20k", caret: 3 });
    expect(applyEdit("20k", "2m0k", 2, NGN, "insert")).toEqual({ text: "20k", caret: 1 });
  });
});

describe("isValidPrefix", () => {
  it("accepts half-typed sums and rejects broken ones", () => {
    expect(isValidPrefix("2.5k+", NGN)).toBe(true);
    expect(isValidPrefix("(2", NGN)).toBe(true);
    expect(isValidPrefix("2)", NGN)).toBe(false);
    expect(isValidPrefix("2k5", NGN)).toBe(false);
    expect(isValidPrefix(".5", NGN)).toBe(true);
    expect(isValidPrefix("1..", NGN)).toBe(false);
  });
});

describe("group", () => {
  it("groups only whole parts", () => {
    expect(group("1234.5678+9999").text).toBe("1,234.5678+9,999");
    expect(group("-1000").text).toBe("-1,000");
    expect(group("").text).toBe("");
  });
});

describe("cleanPaste", () => {
  it.each([
    ["₦20,000.00", false, "20,000.00"],
    ["NGN 20 000", false, "20000"],
    ["(1,234.50)", true, "-1,234.50"],
    ["(1,234.50)", false, "1,234.50"],
    ["1,234.50-", true, "-1,234.50"],
    ["1.234,50", false, "1234.50"],
    ["12,50", false, "12.50"],
    ["$12", false, "12"],
    ["US$ 1,000", false, "1,000"],
    ["KSh 1,000", false, "1,000"],
    ["-₦500", true, "-500"],
    ["(100+200)", true, "(100+200)"],
  ])("%s (negatives %s) → %s", (pasted, allowNegative, cleaned) => {
    expect(cleanPaste(pasted, allowNegative)).toBe(cleaned);
  });

  it("pastes through to a readable field", () => {
    const text = applyEdit("", cleanPaste("₦20,000.00", false), 20, NGN, "paste").text;
    expect(text).toBe("20,000.00");
    expect(evaluate(text, "NGN")).toEqual({ minor: 2_000_000 });
  });
});

describe("evaluate", () => {
  it.each([
    ["20k", "NGN", 2_000_000],
    ["1.5m", "NGN", 150_000_000],
    ["2.5k+800", "NGN", 330_000],
    ["1,500 + 2,300", "NGN", 380_000],
    ["100/3", "NGN", 3333],
    ["200/3", "NGN", 6667],
    ["0.1+0.2", "NGN", 30],
    ["0.005×1", "USD", 1],
    ["2+3×4", "NGN", 1400],
    ["(2+3)×4", "NGN", 2000],
    ["((1+1)×(2+2))÷2", "NGN", 400],
    ["5×-2", "NGN", -1000],
    ["-1,000", "NGN", -100_000],
    ["500-800", "NGN", -30_000],
    ["1.5k", "JPY", 1500],
    ["20,000.00", "JPY", 20_000],
    ["10÷4", "JPY", 3],
    ["-10÷4", "JPY", -3],
  ] as const)("%s in %s → %i minor", (text, currency, minor) => {
    expect(evaluate(text, currency)).toEqual({ minor });
  });

  it.each([
    ["1/0", "NGN", "Can't divide by 0"],
    ["2+", "NGN", "Not an amount"],
    ["(2+3", "NGN", "Not an amount"],
    ["abc", "NGN", "Not an amount"],
    ["12.50", "JPY", "No decimals in JPY"],
    ["12.345", "NGN", "Only 2 decimals in NGN"],
    ["999999999999999×999", "NGN", "Too large"],
  ] as const)("%s in %s → %s", (text, currency, error) => {
    expect(evaluate(text, currency)).toEqual({ error });
  });
});

describe("readAmount", () => {
  it("applies the field's rule", () => {
    expect(readAmount("", "NGN", "positive", "Enter an amount")).toEqual({ value: null, minor: null, error: "Enter an amount" });
    expect(readAmount("", "NGN", "any")).toEqual({ value: 0, minor: 0, error: null });
    expect(readAmount("0", "NGN", "positive", "x")).toEqual({ value: 0, minor: null, error: "Must be more than 0" });
    expect(readAmount("500-800", "NGN", "positive", "x")).toEqual({ value: -30_000, minor: null, error: "Must be more than 0" });
    expect(readAmount("-5", "NGN", "any")).toEqual({ value: -500, minor: -500, error: null });
    expect(readAmount("20ksfjfbjs", "NGN", "positive", "x").error).toBe("Not an amount");
  });
});

describe("display helpers", () => {
  it("plainText groups and trims empty decimals", () => {
    expect(plainText(2_000_000, "NGN")).toBe("20,000");
    expect(plainText(2_000_050, "NGN")).toBe("20,000.50");
    expect(plainText(-30_000, "NGN")).toBe("-300");
    expect(plainText(20_000, "JPY")).toBe("20,000");
    expect(plainText(0, "NGN")).toBe("0");
  });

  it("isPlain tells a number from a sum or short form", () => {
    expect(isPlain("20,000.50")).toBe(true);
    expect(isPlain("-300")).toBe(true);
    expect(isPlain("20k")).toBe(false);
    expect(isPlain("1+2")).toBe(false);
  });

  it("normalize drops what can't be in an amount", () => {
    expect(normalize("₦ 1,2 K")).toBe("12k");
  });

  it("currencySymbol", () => {
    expect(currencySymbol("NGN")).toBe("₦");
    expect(currencySymbol("JPY")).toBe("¥");
  });
});
