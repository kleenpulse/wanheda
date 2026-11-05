import { describe, expect, it } from "vitest";
import type { Currency } from "../currency";
import { parseCsv } from "./csv";
import { guessMapping, mapRows, readTable } from "./mapping";
import { detectPreset, PRESETS } from "./presets";

// Sample files in the shape public importers describe for each bank (see presets.ts).
// Each is mapped through its detected preset; rows are [day, minor units, payee].
function run(text: string, currency: Currency) {
  const rows = parseCsv(text);
  const table = readTable(rows);
  const found = detectPreset(table);
  if (!found) return { id: null, rows: [], skipped: [] };
  const out = mapRows(rows, table, found.mapping, currency);
  return { id: found.preset.id, rows: out.rows.map((r) => [r.postedOn, r.amountMinor, r.payee]), skipped: out.skipped.map((s) => s.reason) };
}

describe("bank presets", () => {
  it("Chase checking: signed, month first, trailing comma", () => {
    const r = run(
      "Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #\nDEBIT,11/03/2026,\"NETFLIX.COM\",-15.49,ACH_DEBIT,1234.51,,\nCREDIT,11/01/2026,PAYROLL,2500.00,ACH_CREDIT,1250.00,,",
      "USD",
    );
    expect(r).toEqual({
      id: "chase-checking",
      rows: [
        ["2026-11-03", -1_549, "NETFLIX.COM"],
        ["2026-11-01", 250_000, "PAYROLL"],
      ],
      skipped: [],
    });
  });

  it("Chase card: charges negative", () => {
    const r = run("Transaction Date,Post Date,Description,Category,Type,Amount,Memo\n11/02/2026,11/03/2026,SPOTIFY,Entertainment,Sale,-11.99,\n11/04/2026,11/04/2026,Payment Thank You,,Payment,200.00,", "USD");
    expect(r.id).toBe("chase-card");
    expect(r.rows).toEqual([
      ["2026-11-02", -1_199, "SPOTIFY"],
      ["2026-11-04", 20_000, "Payment Thank You"],
    ]);
  });

  it("Bank of America checking: summary block, beginning balance row, quoted thousands", () => {
    const r = run(
      [
        "Description,,Summary Amt.",
        'Beginning balance as of 10/01/2026,,"1,000.00"',
        'Total credits,,"2,500.00"',
        "Total debits,,-15.49",
        'Ending balance as of 10/31/2026,,"3,484.51"',
        "",
        "Date,Description,Amount,Running Bal.",
        '10/01/2026,Beginning balance as of 10/01/2026,,"1,000.00"',
        '10/02/2026,"PAYROLL","2,500.00","3,500.00"',
        '10/05/2026,"NETFLIX.COM",-15.49,"3,484.51"',
      ].join("\r\n"),
      "USD",
    );
    expect(r).toEqual({
      id: "bofa-checking",
      rows: [
        ["2026-10-02", 250_000, "PAYROLL"],
        ["2026-10-05", -1_549, "NETFLIX.COM"],
      ],
      skipped: ["No amount"],
    });
  });

  it("Wells Fargo: no header row", () => {
    const r = run('"11/03/2026","-15.49","*","","NETFLIX.COM 866-579-7172"\n"11/01/2026","2500.00","*","","PAYROLL"', "USD");
    expect(r.id).toBe("wells-fargo");
    expect(r.rows).toEqual([
      ["2026-11-03", -1_549, "NETFLIX.COM 866-579-7172"],
      ["2026-11-01", 250_000, "PAYROLL"],
    ]);
  });

  it("Amex extended: charges positive, line breaks in quoted cells, BOM", () => {
    const r = run(
      '﻿Date,Description,Amount,Extended Details,Appears On Your Statement As,Address,City/State,Zip Code,Country,Reference,Category\n11/02/2026,NETFLIX.COM,15.49,"NETFLIX\nLOS GATOS CA",NETFLIX.COM,"100 Winchester\nCircle",LOS GATOS CA,95032,US,\'320263070012345\',Entertainment\n11/04/2026,AUTOPAY PAYMENT,-200.00,,,,,,,\'320263080054321\',',
      "USD",
    );
    expect(r.id).toBe("amex");
    expect(r.rows).toEqual([
      ["2026-11-02", -1_549, "NETFLIX.COM"],
      ["2026-11-04", 20_000, "AUTOPAY PAYMENT"],
    ]);
  });

  it("Capital One card: unsigned debit and credit, ISO dates", () => {
    const r = run("Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit\n2026-11-02,2026-11-03,1234,SPOTIFY,Entertainment,11.99,\n2026-11-04,2026-11-04,1234,CAPITAL ONE AUTOPAY,Payment,,200.00", "USD");
    expect(r.id).toBe("capital-one-card");
    expect(r.rows).toEqual([
      ["2026-11-02", -1_199, "SPOTIFY"],
      ["2026-11-04", 20_000, "CAPITAL ONE AUTOPAY"],
    ]);
  });

  it("Capital One 360: unsigned amount with a debit/credit type", () => {
    const r = run("Account Number,Transaction Description,Transaction Date,Transaction Type,Transaction Amount,Balance\n3600,Zelle to Ada,11/02/26,Debit,50.00,950.00\n3600,Interest,11/30/26,Credit,1.25,951.25", "USD");
    expect(r.id).toBe("capital-one-360");
    expect(r.rows).toEqual([
      ["2026-11-02", -5_000, "Zelle to Ada"],
      ["2026-11-30", 125, "Interest"],
    ]);
  });

  it("GTBank: preamble, debits and credits, day-month-name dates", () => {
    const r = run(
      "Account Name,A OWNER\nPeriod,01-Nov-2026 to 30-Nov-2026\nTrans. Date,Value Date,Reference,Debits,Credits,Balance,Originating Branch,Remarks\n01-Nov-2026,01-Nov-2026,S1,\"5,000.00\",,\"95,000.00\",E-BRANCH,POS SHOPRITE\n02-Nov-2026,02-Nov-2026,S2,,\"250,000.00\",\"345,000.00\",E-BRANCH,SALARY",
      "NGN",
    );
    expect(r.id).toBe("gtbank");
    expect(r.rows).toEqual([
      ["2026-11-01", -500_000, "POS SHOPRITE"],
      ["2026-11-02", 25_000_000, "SALARY"],
    ]);
  });

  it("Kuda: naira text amounts, two-digit years with a time", () => {
    const r = run(
      "Kuda statement\nA OWNER\n\nDate/Time,Money In,Money out,Category,To / From,Description,Balance\n05/11/26 14:33:00,,\"₦4,500.00\",Food,Chicken Republic,Lunch,\"₦95,500.00\"\n06/11/26 09:00:00,\"₦100,000.00\",,Income,EMPLOYER LTD,Salary,\"₦195,500.00\"",
      "NGN",
    );
    expect(r.id).toBe("kuda");
    expect(r.rows).toEqual([
      ["2026-11-05", -450_000, "Chicken Republic"],
      ["2026-11-06", 10_000_000, "EMPLOYER LTD"],
    ]);
  });

  it("OPay: named-month times, the reference", () => {
    const rows = parseCsv(
      "Trans. Time,Value Date,Description,Debit(₦),Credit(₦),Balance After(₦),Channel,Transaction Reference\n05 Nov 2026 14:22:01,05 Nov 2026,Airtime,500.00,--,9500.00,Mobile,R1\n06 Nov 2026 08:00:00,06 Nov 2026,Transfer from ADA,--,2000.00,11500.00,Mobile,R2",
    );
    const table = readTable(rows);
    const found = detectPreset(table);
    expect(found?.preset.id).toBe("opay");
    const out = found ? mapRows(rows, table, found.mapping, "NGN").rows : [];
    expect(out.map((r) => [r.postedOn, r.amountMinor, r.reference])).toEqual([
      ["2026-11-05", -50_000, "R1"],
      ["2026-11-06", 200_000, "R2"],
    ]);
  });

  it("leaves a bare Date, Description, Amount file to the generic mapper", () => {
    const rows = parseCsv("Date,Description,Amount\n11/02/2026,NETFLIX.COM,15.49");
    expect(detectPreset(readTable(rows))).toBeNull();
  });

  it("every preset has a unique id and a signature or a headerless width", () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    for (const p of PRESETS) expect(p.signatures.length > 0 || p.headerlessWidth !== undefined).toBe(true);
  });
});

describe("generic guess without a header", () => {
  it("finds the date, the amount and the longest text by their cells", () => {
    const rows = parseCsv("x1,05/11/2026,-4500.00,POS PURCHASE SHOPRITE LEKKI\nx2,06/11/2026,100000.00,TRANSFER FROM EMPLOYER LTD");
    const table = readTable(rows);
    expect(table.headerRow).toBeNull();
    expect(guessMapping(table, rows, "NGN")).toEqual({
      date: "Column 2",
      dateOrder: "dmy",
      amount: { kind: "signed", column: "Column 3", outflow: "negative" },
      payee: ["Column 4"],
      balance: null,
      reference: null,
    });
  });

  it("names blank and repeated header cells", () => {
    expect(readTable([["Date", "", "Amount", "Amount"]]).header).toEqual(["Date", "Column 2", "Amount", "Column 4"]);
  });
});
