import { describe, expect, it } from "vitest";
import { parseCsv, sniffDelimiter } from "./csv";
import { fileKey, rowKeys } from "./keys";
import {
  findHeaderRow,
  readTable,
  guessDateOrder,
  guessMapping,
  mapRows,
  missingColumns,
  parseStatementAmount,
  parseStatementDate,
  type ColumnMapping,
  type StatementRow,
} from "./mapping";

describe("parseCsv", () => {
  it("reads quotes, doubled quotes, line breaks in cells, CRLF and a BOM", () => {
    const text = '\uFEFFDate,Description,Amount\r\n2026-11-01,"Jumia, Lagos",-5000\r\n2026-11-02,"Say ""hi""\nthere",250\r\n';
    expect(parseCsv(text)).toEqual([
      ["Date", "Description", "Amount"],
      ["2026-11-01", "Jumia, Lagos", "-5000"],
      ["2026-11-02", 'Say "hi"\nthere', "250"],
    ]);
  });

  it("drops blank lines and keeps a last line without a newline", () => {
    expect(parseCsv("a,b\n\n,\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("sniffs the delimiter past a preamble", () => {
    const text = "Account statement\nName: A. Owner\nDate;Narration;Debit;Credit;Balance\n01/11/2026;POS;5,000.00;;95,000.00\n02/11/2026;Salary;;100,000.00;195,000.00";
    expect(sniffDelimiter(text)).toBe(";");
    expect(sniffDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
    expect(sniffDelimiter('"x, y",1\n"z",2')).toBe(",");
  });
});

describe("parseStatementDate", () => {
  it("reads ISO, named months and both numeric orders, dropping any time", () => {
    expect(parseStatementDate("2026-11-05", "dmy")).toBe("2026-11-05");
    expect(parseStatementDate("2026-11-05T14:33:00Z", "mdy")).toBe("2026-11-05");
    expect(parseStatementDate("05-Nov-2026", "mdy")).toBe("2026-11-05");
    expect(parseStatementDate("05 November 2026 14:33", "mdy")).toBe("2026-11-05");
    expect(parseStatementDate("Nov 5, 2026", "dmy")).toBe("2026-11-05");
    expect(parseStatementDate("Thu, 05 Nov 2026", "dmy")).toBe("2026-11-05");
    expect(parseStatementDate("05/11/2026", "dmy")).toBe("2026-11-05");
    expect(parseStatementDate("11/05/2026", "mdy")).toBe("2026-11-05");
    expect(parseStatementDate("5/11/26 09:10:11", "dmy")).toBe("2026-11-05");
  });

  it("refuses what isn't a calendar day", () => {
    expect(parseStatementDate("31/02/2026", "dmy")).toBeNull();
    expect(parseStatementDate("Opening Balance", "dmy")).toBeNull();
    expect(parseStatementDate("", "dmy")).toBeNull();
    expect(parseStatementDate("13/13/2026", "mdy")).toBeNull();
  });

  it("guesses the order from the dates, then from the currency", () => {
    expect(guessDateOrder(["01/11/2026", "25/11/2026"], "USD")).toBe("dmy");
    expect(guessDateOrder(["11/01/2026", "11/25/2026"], "NGN")).toBe("mdy");
    expect(guessDateOrder(["01/02/2026"], "USD")).toBe("mdy");
    expect(guessDateOrder(["01/02/2026"], "NGN")).toBe("dmy");
  });
});

describe("parseStatementAmount (V25)", () => {
  it("reads signs, brackets, DR and CR, trailing minus, symbols and codes", () => {
    expect(parseStatementAmount("-1,250.50", "NGN")).toBe(-125_050);
    expect(parseStatementAmount("(1,250.50)", "NGN")).toBe(-125_050);
    expect(parseStatementAmount("1,250.50 DR", "NGN")).toBe(-125_050);
    expect(parseStatementAmount("1,250.50DR", "NGN")).toBe(-125_050);
    expect(parseStatementAmount("1,250.50 CR", "NGN")).toBe(125_050);
    expect(parseStatementAmount("1,250.50-", "NGN")).toBe(-125_050);
    expect(parseStatementAmount("₦1,250.50", "NGN")).toBe(125_050);
    expect(parseStatementAmount("-$12.99", "USD")).toBe(-1_299);
    expect(parseStatementAmount("$-12.99", "USD")).toBe(-1_299);
    expect(parseStatementAmount("NGN 5,000", "NGN")).toBe(500_000);
    expect(parseStatementAmount("+20", "USD")).toBe(2_000);
  });

  it("is 0 when empty and null when not an amount", () => {
    expect(parseStatementAmount("", "NGN")).toBe(0);
    expect(parseStatementAmount(" - ", "NGN")).toBe(0);
    expect(parseStatementAmount("abc", "NGN")).toBeNull();
    expect(parseStatementAmount("1.2.3", "NGN")).toBeNull();
    expect(parseStatementAmount("12.345", "USD")).toBeNull();
    expect(parseStatementAmount("5k", "NGN")).toBeNull();
  });
});

const NG = parseCsv(
  [
    "Customer Statement",
    "Account Name,A OWNER",
    "Period,01-Nov-2026 to 30-Nov-2026",
    "Trans. Date,Value Date,Reference,Narration,Debit,Credit,Balance",
    ",,,Opening Balance,,,100000.00",
    "01-Nov-2026,01-Nov-2026,S1,POS PURCHASE SHOPRITE,5000.00,,95000.00",
    "02-Nov-2026,02-Nov-2026,S2,TRANSFER FROM EMPLOYER,,250000.00,345000.00",
    "02-Nov-2026,02-Nov-2026,S3,NIP TRANSFER TO JOHN,10000.00,,335000.00",
    "02-Nov-2026,02-Nov-2026,S3,NIP CHARGE,10.75,,334989.25",
    "03-Nov-2026,03-Nov-2026,S4,ODD ROW,1.00,1.00,334989.25",
    ",,,Closing Balance,,,334989.25",
  ].join("\n"),
);

describe("header and mapping", () => {
  it("finds the header under a preamble and guesses a debit/credit mapping", () => {
    const h = findHeaderRow(NG);
    expect(h).toBe(3);
    const table = readTable(NG);
    const header = table.header;
    const m = guessMapping(table, NG.slice((h ?? 0) + 1), "NGN");
    expect(m).toEqual({
      date: "Trans. Date",
      dateOrder: "dmy",
      amount: { kind: "split", out: "Debit", in: "Credit" },
      payee: ["Narration"],
      balance: "Balance",
      reference: "Reference",
    });
    expect(m && missingColumns(header, m)).toEqual([]);
    expect(m && missingColumns(["Date", "Amount"], m)).toEqual(["Trans. Date", "Debit", "Credit", "Narration", "Balance", "Reference"]);
  });

  it("maps rows, listing what it skips and why", () => {
    const h = findHeaderRow(NG) ?? 0;
    const m = guessMapping(readTable(NG), NG.slice(h + 1), "NGN");
    if (!m) throw new Error("no mapping");
    const { rows, skipped } = mapRows(NG, readTable(NG), m, "NGN");
    expect(rows.map((r) => [r.rowNo, r.postedOn, r.amountMinor, r.payee, r.balanceMinor, r.reference])).toEqual([
      [6, "2026-11-01", -500_000, "POS PURCHASE SHOPRITE", 9_500_000, "S1"],
      [7, "2026-11-02", 25_000_000, "TRANSFER FROM EMPLOYER", 34_500_000, "S2"],
      [8, "2026-11-02", -1_000_000, "NIP TRANSFER TO JOHN", 33_500_000, "S3"],
      [9, "2026-11-02", -1_075, "NIP CHARGE", 33_498_925, "S3"],
    ]);
    expect(skipped).toEqual([
      { rowNo: 5, reason: "No date" },
      { rowNo: 10, reason: "Both a debit and a credit" },
      { rowNo: 11, reason: "No date" },
    ]);
  });

  it("flips a card export where charges are positive", () => {
    const rows = parseCsv("Date,Description,Amount\n11/03/2026,NETFLIX.COM,15.49\n11/04/2026,PAYMENT THANK YOU,-200.00");
    const m: ColumnMapping = { date: "Date", dateOrder: "mdy", amount: { kind: "signed", column: "Amount", outflow: "positive" }, payee: ["Description"], balance: null, reference: null };
    expect(mapRows(rows, readTable(rows), m, "USD").rows.map((r) => [r.postedOn, r.amountMinor])).toEqual([
      ["2026-11-03", -1_549],
      ["2026-11-04", 20_000],
    ]);
  });
});

function row(over: Partial<StatementRow>): StatementRow {
  return { rowNo: 1, postedOn: "2026-11-01", amountMinor: -500_000, payee: "POS SHOPRITE", balanceMinor: null, reference: null, ...over };
}

describe("rowKeys (V12)", () => {
  it("keeps 2 identical rows as 2", async () => {
    const keys = await rowKeys([row({ rowNo: 1 }), row({ rowNo: 2 })]);
    expect(new Set(keys).size).toBe(2);
  });

  it("gives a re-downloaded file the same keys", async () => {
    const file = [row({ rowNo: 1 }), row({ rowNo: 2 }), row({ rowNo: 3, payee: "UBER" })];
    expect(await rowKeys(file)).toEqual(await rowKeys(file.map((r) => ({ ...r, payee: r.payee.toLowerCase() }))));
  });

  it("gives an overlapping later statement the same keys for the shared days", async () => {
    const early = [row({ postedOn: "2026-11-01" }), row({ postedOn: "2026-11-02" }), row({ postedOn: "2026-11-02" })];
    const later = [row({ postedOn: "2026-11-02" }), row({ postedOn: "2026-11-02" }), row({ postedOn: "2026-11-03" })];
    const [a, b] = [await rowKeys(early), await rowKeys(later)];
    expect(b.slice(0, 2)).toEqual(a.slice(1, 3));
    expect(a).not.toContain(b[2]);
  });

  it("tells identical rows apart by running balance when there is one", async () => {
    const keys = await rowKeys([row({ balanceMinor: 100 }), row({ balanceMinor: 50 })]);
    expect(new Set(keys).size).toBe(2);
    // The same rows from another file with a different neighbour order still match.
    expect(await rowKeys([row({ balanceMinor: 50 })])).toEqual([keys[1]]);
  });

  it("uses the bank's reference, unless the file repeats it", async () => {
    const keys = await rowKeys([row({ reference: "S1" }), row({ reference: "S3", amountMinor: -1_000_000 }), row({ reference: "S3", amountMinor: -1_075 })]);
    expect(keys[0]).toMatch(/^ref:[0-9a-f]{64}$/);
    expect(keys[1]).toMatch(/^h:/);
    expect(keys[1]).not.toBe(keys[2]);
  });

  it("keys a file by account and bytes", async () => {
    const bytes = new TextEncoder().encode("a,b\n1,2");
    const k = await fileKey("acc-1", bytes);
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(await fileKey("acc-1", bytes)).toBe(k);
    expect(await fileKey("acc-2", bytes)).not.toBe(k);
  });
});
