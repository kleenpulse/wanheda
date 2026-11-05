import { describe, expect, it } from "vitest";
import { csvField, exportFilename, toCsv, toJson, type MoneyExport } from "./export";
import type { Txn } from "./money";

const txn = (over: Partial<Txn>): Txn => ({
  id: "t1",
  accountId: "a1",
  postedOn: "2026-11-02",
  amountMinor: -450_050,
  currency: "NGN",
  payee: "Jollof spot",
  categoryId: "c2",
  note: "",
  tags: [],
  source: "manual",
  transferId: null,
  createdAt: 1,
  ...over,
});

const data: MoneyExport = {
  exportedAt: "2026-11-05T00:00:00.000Z",
  baseCurrency: "NGN",
  timeZone: "Africa/Lagos",
  accounts: [{ id: "a1", slug: null, name: "Cash", kind: "cash", currency: "NGN", openingMinor: 0, archived: false }],
  categories: [
    { id: "c1", slug: null, name: "Food", parentId: null, emoji: "", color: "slate", kind: "expense", archived: false },
    { id: "c2", slug: null, name: "Eating out", parentId: "c1", emoji: "", color: "slate", kind: "expense", archived: false },
  ],
  txns: [
    txn({ id: "t2", postedOn: "2026-11-03", amountMinor: 1_000, currency: "JPY", payee: '=HYPERLINK("x")', categoryId: null, tags: ["a", "b"], note: "line\nbreak" }),
    txn({}),
  ],
  subscriptions: [],
  budgets: [],
  rules: [],
};

describe("csvField", () => {
  it("quotes what needs it and defuses formulas in text", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField('a "q", b')).toBe('"a ""q"", b"');
    expect(csvField("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvField("+234")).toBe("'+234");
    expect(csvField("-4500.50", false)).toBe("-4500.50");
  });
});

describe("toCsv", () => {
  it("one row per entry, oldest first, exact amounts", () => {
    const lines = toCsv(data).split("\r\n");
    expect(lines[0]).toBe("date,amount,currency,amount_minor,payee,category,account,tags,note,source,id");
    expect(lines[1]).toBe("2026-11-02,-4500.50,NGN,-450050,Jollof spot,Food › Eating out,Cash,,,manual,t1");
    // The note's line break stays inside its quoted field: one record, split on CRLF only.
    expect(lines[2]).toBe(`2026-11-03,1000,JPY,1000,"'=HYPERLINK(""x"")",,Cash,a;b,"line\nbreak",manual,t2`);
    expect(toCsv(data).endsWith("\r\n")).toBe(true);
  });
});

describe("toJson", () => {
  it("carries every table and a decimal amount per entry", () => {
    const parsed = JSON.parse(toJson(data)) as { txns: { amount: string; amountMinor: number }[]; accounts: unknown[] };
    expect(parsed.txns.map((t) => t.amount)).toEqual(["1000", "-4500.50"]);
    expect(parsed.accounts).toHaveLength(1);
  });

  it("names the file by format and day", () => {
    expect(exportFilename("csv", "2026-11-05")).toBe("wanheda-money-2026-11-05.csv");
  });
});
