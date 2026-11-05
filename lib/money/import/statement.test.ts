import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import { rowKeys } from "./keys";
import type { ColumnMapping, StatementRow } from "./mapping";
import { analyseStatement, blankMapping, flipSigns, pickMapping, readError, readSheet, type SavedMapping } from "./statement";
import { importWriteSchema, splitByPresence } from "./write";
import { SheetError } from "./xlsx";
import { readTable } from "./mapping";

const ACC = "0b9e1c4e-6f0a-4c39-9a51-2f8d7c3b1a11";
const OTHER = "0b9e1c4e-6f0a-4c39-9a51-2f8d7c3b1a12";
const enc = (s: string) => new TextEncoder().encode(s);

const OCTOBER = [
  "Date,Narration,Debit,Credit,Balance",
  "01/10/2026,POS JUMIA,5000.00,,95000.00",
  "01/10/2026,POS JUMIA,5000.00,,90000.00",
  "15/10/2026,SALARY,,100000.00,190000.00",
  "31/10/2026,NETFLIX,4500.00,,185500.00",
  "Closing balance,,,,185500.00",
].join("\n");

// A later statement that overlaps October's last two weeks.
const OCT_NOV = [
  "Date,Narration,Debit,Credit,Balance",
  "15/10/2026,SALARY,,100000.00,190000.00",
  "31/10/2026,NETFLIX,4500.00,,185500.00",
  "03/11/2026,UBER,2500.00,,183000.00",
].join("\n");

async function analyse(text: string, accountId = ACC, saved: SavedMapping[] = []) {
  const bytes = enc(text);
  return analyseStatement(readSheet(bytes), bytes, { accountId, currency: "NGN", saved, mapping: null });
}

describe("readSheet", () => {
  it("refuses empty files, PDFs and binary .xls with a message the owner can act on", () => {
    expect(() => readSheet(new Uint8Array())).toThrow(SheetError);
    expect(() => readSheet(enc("%PDF-1.7\n..."))).toThrow(/PDF/);
    expect(() => readSheet(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0]))).toThrow(/\.xls/);
    expect(readError(new SheetError("Nope."))).toBe("Nope.");
    expect(readError(new Error("internal detail"))).not.toContain("internal");
  });
});

describe("analyseStatement (V12, V32)", () => {
  it("maps a statement, keys its rows and lists what it skips", async () => {
    const a = await analyse(OCTOBER);
    expect(a.pick?.source).toBe("guess");
    expect(a.missing).toEqual([]);
    expect(a.rows.map((r) => r.amountMinor)).toEqual([-500_000, -500_000, 10_000_000, -450_000]);
    expect(a.skipped).toEqual([{ rowNo: 6, reason: 'Not a date: "Closing balance"' }]);
    expect(a.fileKey).toMatch(/^[0-9a-f]{64}$/);
    expect(a.bodyCount).toBe(5);
  });

  it("imports 2 identical rows as 2", async () => {
    const a = await analyse(OCTOBER);
    const [first, second] = a.rows;
    expect(first?.payee).toBe(second?.payee);
    expect(new Set(a.rows.map((r) => r.key)).size).toBe(a.rows.length);
  });

  it("finds nothing new in a re-download, and the same file is the same file key", async () => {
    const a = await analyse(OCTOBER);
    const b = await analyse(OCTOBER);
    expect(b.fileKey).toBe(a.fileKey);
    const { fresh, already } = splitByPresence(b.rows, new Set(a.rows.map((r) => r.key)));
    expect(fresh).toEqual([]);
    expect(already).toHaveLength(4);
  });

  it("finds only the new days in an overlapping later statement", async () => {
    const a = await analyse(OCTOBER);
    const b = await analyse(OCT_NOV);
    expect(b.fileKey).not.toBe(a.fileKey);
    const { fresh, already } = splitByPresence(b.rows, new Set(a.rows.map((r) => r.key)));
    expect(fresh.map((r) => r.payee)).toEqual(["UBER"]);
    expect(already).toHaveLength(2);
  });

  it("keys the same file into another account differently", async () => {
    expect((await analyse(OCTOBER, OTHER)).fileKey).not.toBe((await analyse(OCTOBER)).fileKey);
  });

  it("says which columns a mapping names that the file lacks, and maps nothing then", async () => {
    const bytes = enc(OCTOBER);
    const mapping: ColumnMapping = { ...blankMapping(["Date", "Amount", "Narration"]), date: "Posted" };
    const a = await analyseStatement(readSheet(bytes), bytes, { accountId: ACC, currency: "NGN", saved: [], mapping: { source: "custom", bankName: "", presetId: null, mapping } });
    expect(a.missing).toEqual(["Posted", "Amount"]);
    expect(a.rows).toEqual([]);
  });

  it("cuts a long payee to what a txn holds before keying it", async () => {
    const long = "X".repeat(300);
    const a = await analyse(`Date,Description,Amount\n2026-11-01,${long},-5`);
    expect(a.rows[0]?.payee).toHaveLength(200);
  });

  it("keeps one long narration or reference from sinking the whole import (review FIX)", async () => {
    const narration = "NIP TRANSFER ".repeat(20).trim();
    const ref = "R".repeat(150);
    const a = await analyse(`Date,Narration,Reference,Amount\n2026-11-01,${narration},${ref},-5\n2026-11-02,POS,R2,-7`);
    expect(a.rows[0]?.payee.length).toBeLessThanOrEqual(200);
    expect(a.rows.every((r) => r.key.length <= 100)).toBe(true);
    const write = {
      batchId: "0b9e1c4e-6f0a-4c39-9a51-2f8d7c3b1a30",
      accountId: ACC,
      filename: "nov.csv",
      fileKey: a.fileKey,
      rows: a.rows.map((r) => ({ key: r.key, rowNo: r.rowNo, postedOn: r.postedOn, amountMinor: r.amountMinor, payee: r.payee })),
      skipped: a.skipped,
      mapping: null,
    };
    expect(importWriteSchema.safeParse(write).success).toBe(true);
  });

  it("doesn't match a bank reference reused on another day", async () => {
    const a = await analyse("Date,Description,Reference,Amount\n2026-10-01,CHEQUE,1001,-5");
    const b = await analyse("Date,Description,Reference,Amount\n2026-11-01,CHEQUE,1001,-5");
    expect(a.rows[0]?.key).not.toBe(b.rows[0]?.key);
  });
});

describe("pickMapping", () => {
  const cells = parseCsv(OCTOBER);
  const table = readTable(cells);
  const body = cells.slice(1);
  const mine: SavedMapping = {
    id: "0b9e1c4e-6f0a-4c39-9a51-2f8d7c3b1a20",
    bankName: "My bank",
    columns: { date: "Date", dateOrder: "dmy", amount: { kind: "split", out: "Debit", in: "Credit" }, payee: ["Narration"], balance: "Balance", reference: null },
  };

  it("prefers a saved mapping that fits, then a preset, then a guess", () => {
    expect(pickMapping(table, body, "NGN", [mine])).toMatchObject({ source: "saved", bankName: "My bank" });
    expect(pickMapping(table, body, "NGN", [])?.source).toBe("guess");
    const gtb = readTable(parseCsv("Trans. Date,Value. Date,Reference,Debits,Credits,Balance,Originating Branch,Remarks\n01-Nov-2026,01-Nov-2026,R1,5000,,1000,Lagos,POS"));
    expect(pickMapping(gtb, [], "NGN", [])).toMatchObject({ source: "preset", presetId: "gtbank" });
  });

  it("skips a saved mapping whose columns aren't in the file", () => {
    expect(pickMapping(table, body, "NGN", [{ ...mine, columns: { ...mine.columns, payee: ["Remarks"] } }])?.source).toBe("guess");
  });

  it("matches a headerless saved mapping only to a headerless file", () => {
    const headerless: SavedMapping = { ...mine, columns: { ...blankMapping(["Column 1", "Column 2", "Column 3"]) } };
    expect(pickMapping(table, body, "NGN", [headerless])?.source).toBe("guess");
    const wf = readTable([["11/01/2026", "-5.00", "*", "", "SHELL"]]);
    expect(pickMapping(wf, [["11/01/2026", "-5.00", "*", "", "SHELL"]], "USD", [headerless])?.source).toBe("saved");
  });
});

describe("flipSigns", () => {
  it("turns a signed column's outflow round and swaps debit and credit", () => {
    const signed = blankMapping(["Date", "Amount", "Payee"]);
    expect(flipSigns(signed)?.amount).toEqual({ kind: "signed", column: "Amount", outflow: "positive" });
    expect(flipSigns({ ...signed, amount: { kind: "split", out: "Debit", in: "Credit" } })?.amount).toEqual({ kind: "split", out: "Credit", in: "Debit" });
    expect(flipSigns({ ...signed, amount: { kind: "typed", column: "Amount", type: "Type" } })).toBeNull();
  });
});

describe("rowKeys: a balance that never moves", () => {
  it("still gives every row its own key", async () => {
    const row = (rowNo: number): StatementRow => ({ rowNo, postedOn: "2026-11-01", amountMinor: -500, payee: "POS", balanceMinor: 1000, reference: null });
    const keys = await rowKeys([row(1), row(2), row(3)]);
    expect(new Set(keys).size).toBe(3);
    expect(keys[1]).toBe(`${keys[0] ?? ""}#1`);
  });
});

describe("importWriteSchema", () => {
  const base = {
    batchId: "0b9e1c4e-6f0a-4c39-9a51-2f8d7c3b1a30",
    accountId: ACC,
    filename: "oct.csv",
    fileKey: "a".repeat(64),
    rows: [{ key: "ref:1", rowNo: 2, postedOn: "2026-11-01", amountMinor: -500, payee: "POS" }],
    skipped: [],
    mapping: null,
  };

  it("takes a confirmed import", () => {
    expect(importWriteSchema.safeParse(base).success).toBe(true);
  });

  it("refuses repeated row keys, zero amounts, a bad file key and unknown fields", () => {
    const row = base.rows[0];
    expect(importWriteSchema.safeParse({ ...base, rows: [row, row] }).success).toBe(false);
    expect(importWriteSchema.safeParse({ ...base, rows: [{ ...row, amountMinor: 0 }] }).success).toBe(false);
    expect(importWriteSchema.safeParse({ ...base, fileKey: "xyz" }).success).toBe(false);
    expect(importWriteSchema.safeParse({ ...base, userId: "someone-else" }).success).toBe(false);
  });
});
