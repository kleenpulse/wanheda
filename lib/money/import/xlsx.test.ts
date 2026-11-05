import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { mapRows, readTable } from "./mapping";
import { detectPreset } from "./presets";
import { numberText, readHtmlTable, readXlsx, SheetError, sniffSheet } from "./xlsx";

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

/** A one-sheet workbook. `p` is the element prefix ("" or "x:"), as different writers use. */
function book(sheetRows: string, shared: string[], p = "", styles = "") {
  const px = p === "" ? NS : NS.replace('xmlns="', `xmlns:${p.slice(0, -1)}="`);
  return zipSync({
    "xl/workbook.xml": strToU8(`<?xml version="1.0"?><${p}workbook ${px}><${p}sheets><${p}sheet name="Wallet Account Transactions" sheetId="1" r:id="rId1"/></${p}sheets></${p}workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/data.xml"/></Relationships>',
    ),
    "xl/worksheets/data.xml": strToU8(`<?xml version="1.0"?><${p}worksheet ${px}><${p}sheetData>${sheetRows}</${p}sheetData></${p}worksheet>`),
    "xl/sharedStrings.xml": strToU8(`<?xml version="1.0"?><${p}sst ${px}>${shared.map((s) => `<${p}si><${p}t xml:space="preserve">${s}</${p}t></${p}si>`).join("")}</${p}sst>`),
    ...(styles === "" ? {} : { "xl/styles.xml": strToU8(`<?xml version="1.0"?><styleSheet ${NS}>${styles}</styleSheet>`) }),
  });
}

describe("sniffSheet", () => {
  it("tells xlsx, binary xls, an HTML table and text apart by their bytes", () => {
    expect(sniffSheet(book("", []))).toBe("xlsx");
    expect(sniffSheet(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0]))).toBe("xls-binary");
    expect(sniffSheet(strToU8("﻿  <html><body><table id=dgtrans><tr><td>1</td></tr></table>"))).toBe("html");
    expect(sniffSheet(strToU8("Date,Amount\n1,2"))).toBe("text");
  });
});

describe("numberText (V25)", () => {
  it("cuts float noise on the digit string, never through a float", () => {
    expect(numberText("0.30000000000000004")).toBe("0.3");
    expect(numberText("4500.0100000000002")).toBe("4500.01");
    expect(numberText("1234.5")).toBe("1234.5");
    expect(numberText("-15.49")).toBe("-15.49");
    expect(numberText("3E-1")).toBe("0.3");
    expect(numberText("1.5E+3")).toBe("1500");
    expect(numberText("99999.999999999999")).toBe("100000");
    expect(numberText("0")).toBe("0");
  });
});

describe("readXlsx", () => {
  const rows =
    '<row r="1"><c r="A1" t="s"><v>0</v></c></row>' +
    '<row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3" t="s"><v>2</v></c><c r="D3" t="s"><v>3</v></c><c r="E3" t="s"><v>4</v></c></row>' +
    '<row r="4"><c r="A4" s="1"><v>46331</v></c><c r="B4" t="inlineStr"><is><t>Airtime &amp; data</t></is></c><c r="D4"><v>500.00000000000006</v></c></row>' +
    '<row r="5"><c r="A5" s="1"><v>46332.75</v></c><c r="B5" t="str"><v>Transfer from ADA</v></c><c r="E5"><v>2000</v></c></row>';
  const shared = ["Statement for A OWNER", "Trans. Time", "Description", "Debit(₦)", "Credit(₦)"];
  const styles = '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd&quot; &quot;mmm&quot; &quot;yyyy hh:mm"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs>';

  it("reads shared, inline and formula strings, date cells and gaps between columns", () => {
    expect(readXlsx(book(rows, shared, "", styles))).toEqual([
      ["Statement for A OWNER"],
      ["Trans. Time", "Description", "", "Debit(₦)", "Credit(₦)"],
      ["2026-11-05", "Airtime & data", "", "500"],
      ["2026-11-06", "Transfer from ADA", "", "", "2000"],
    ]);
  });

  it("reads elements written with a namespace prefix", () => {
    const prefixed = rows.replace(/<(\/?)(row|c|v|is|t)([\s>])/g, "<$1x:$2$3");
    expect(readXlsx(book(prefixed, shared, "x:", styles))).toEqual(readXlsx(book(rows, shared, "", styles)));
  });

  it("refuses what isn't a workbook", () => {
    expect(() => readXlsx(strToU8("not a zip"))).toThrow(SheetError);
    expect(() => readXlsx(zipSync({ "hello.txt": strToU8("hi") }))).toThrow(SheetError);
  });
});

describe("readHtmlTable", () => {
  it("reads the largest table of an HTML '.xls'", () => {
    const html = `<html><body><table><tr><td>Logo</td></tr></table>
      <table id="dgtrans"><tr><th>Trans Date</th><th>Reference</th><th>Debit</th><th>Credit</th><th>Balance</th><th>Remarks</th></tr>
      <tr><td>01-Nov-2026</td><td>S1</td><td>5,000.00</td><td>&nbsp;</td><td>95,000.00</td><td>POS<br/>SHOPRITE</td></tr></table></body></html>`;
    const rows = readHtmlTable(strToU8(html));
    expect(rows).toEqual([
      ["Trans Date", "Reference", "Debit", "Credit", "Balance", "Remarks"],
      ["01-Nov-2026", "S1", "5,000.00", "", "95,000.00", "POS SHOPRITE"],
    ]);
    const table = readTable(rows);
    const found = detectPreset(table);
    expect(found?.preset.id).toBe("gtbank");
    expect(found && mapRows(rows, table, found.mapping, "NGN").rows.map((r) => [r.postedOn, r.amountMinor, r.payee])).toEqual([["2026-11-01", -500_000, "POS SHOPRITE"]]);
  });
});
