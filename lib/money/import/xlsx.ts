import { unzipSync } from "fflate";

// Spreadsheet statements (SPEC T37): .xlsx, and the ".xls" files some banks
// send that are really an HTML table (older GTBank exports). Read to the same
// string[][] as the CSV reader. No DOMParser (the import worker has none): the
// few elements needed are matched by pattern, with any namespace prefix, so
// files that write <x:c> instead of <c> (Kuda's) read too.

export type SheetKind = "xlsx" | "html" | "xls-binary" | "text";

/** What the bytes are, by their first bytes rather than the file name. */
export function sniffSheet(bytes: Uint8Array): SheetKind {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return "xlsx";
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return "xls-binary";
  const head = new TextDecoder().decode(bytes.subarray(0, 2048)).replace(/^﻿/, "").trimStart().toLowerCase();
  if (head.startsWith("<") && /<table[\s>]/.test(new TextDecoder().decode(bytes.subarray(0, 200_000)).toLowerCase())) return "html";
  return "text";
}

export class SheetError extends Error {}

/** A bound on what one statement may unpack to: a zip bomb stops here. */
const MAX_UNPACKED = 60 * 1024 * 1024;

const ENTITY: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all;
    }
    return ENTITY[e.toLowerCase()] ?? all;
  });
}

/** Elements by local name, any prefix: el("c") matches <c …> and <x:c …>. */
const el = (name: string, flags = "g") => new RegExp(`<(?:[\\w.-]+:)?${name}(\\s[^>]*)?(?:/>|>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>)`, flags);
const attr = (attrs: string | undefined, name: string) => new RegExp(`(?:^|\\s)(?:[\\w.-]+:)?${name}="([^"]*)"`).exec(attrs ?? "")?.[1] ?? null;

/** Every <t> inside, joined: rich text runs come as several. Phonetic runs (<rPh>) are left out. */
function textOf(xml: string): string {
  const plain = xml.replace(el("rPh"), "");
  return decode([...plain.matchAll(el("t"))].map((m) => m[2] ?? "").join(""));
}

/** "AB12" → column index 27. */
function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.toUpperCase()) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

/** Whether a number format shows a date: d, m or y outside quotes and [colour] blocks. */
function isDateFormat(code: string): boolean {
  const bare = code.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "").replace(/\\./g, "");
  return /[dy]/i.test(bare) || /m/i.test(bare.replace(/[hs]+:?m+|m+:?s+/gi, ""));
}

/** Cell style indexes (`s="…"`) that show a date. */
function dateStyles(stylesXml: string | null): Set<number> {
  const out = new Set<number>();
  if (!stylesXml) return out;
  const custom = new Map<number, string>();
  for (const m of stylesXml.matchAll(el("numFmt"))) {
    const id = Number(attr(m[1], "numFmtId"));
    const code = attr(m[1], "formatCode");
    if (Number.isInteger(id) && code !== null) custom.set(id, decode(code));
  }
  const xfs = el("cellXfs", "").exec(stylesXml)?.[2] ?? "";
  let i = 0;
  for (const m of xfs.matchAll(el("xf"))) {
    const id = Number(attr(m[1], "numFmtId") ?? "0");
    const code = custom.get(id);
    if (BUILTIN_DATE_FORMATS.has(id) || (code !== undefined && isDateFormat(code))) out.add(i);
    i++;
  }
  return out;
}

/** An Excel day serial as "YYYY-MM-DD" (the time of day dropped, V27). */
function serialToDay(serial: string, date1904: boolean): string | null {
  const whole = /^(\d+)(?:\.\d+)?$/.exec(serial.trim())?.[1];
  if (whole === undefined) return null;
  const days = Number(whole) + (date1904 ? 1462 : 0);
  if (days < 1 || days > 2_958_465) return null;
  const d = new Date(Date.UTC(1899, 11, 30 + days));
  return d.toISOString().slice(0, 10);
}

/**
 * A stored number as plain decimal text, never through a float (V25). Excel
 * keeps doubles, so 0.3 may arrive as "0.30000000000000004" or "3E-1": the
 * digits are cut to 15 significant (all a double holds), rounding half up on
 * the digit string, and exponents are shifted as text.
 */
export function numberText(raw: string): string {
  const m = /^(-?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(raw.trim());
  if (!m) return raw.trim();
  const sign = m[1] ?? "";
  let digits = (m[2] ?? "") + (m[3] ?? "");
  let point = (m[2] ?? "").length + Number(m[4] ?? "0");
  const lead = /^0*/.exec(digits)?.[0].length ?? 0;
  digits = digits.slice(lead);
  point -= lead;
  if (digits === "") return "0";
  if (digits.length > 15) {
    const up = Number(digits[15]) >= 5;
    digits = digits.slice(0, 15);
    if (up) {
      const arr = digits.split("").map(Number);
      let i = arr.length - 1;
      while (i >= 0 && arr[i] === 9) arr[i--] = 0;
      if (i < 0) {
        arr.unshift(1);
        point++;
      } else arr[i] = (arr[i] ?? 0) + 1;
      digits = arr.join("");
    }
  }
  digits = digits.replace(/0+$/, "");
  if (digits === "") return "0";
  let out: string;
  if (point <= 0) out = `0.${"0".repeat(-point)}${digits}`;
  else if (point >= digits.length) out = digits + "0".repeat(point - digits.length);
  else out = `${digits.slice(0, point)}.${digits.slice(point)}`;
  return sign + out;
}

/** The first sheet of an .xlsx, as rows of text. */
export function readXlsx(bytes: Uint8Array): string[][] {
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        total += f.originalSize;
        if (total > MAX_UNPACKED) throw new SheetError("This spreadsheet unpacks to more than a statement should.");
        return /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|worksheets\/[^/]+\.xml)$/i.test(f.name);
      },
    });
  } catch (e) {
    if (e instanceof SheetError) throw e;
    throw new SheetError("This file isn't a readable .xlsx.");
  }
  const text = (name: string) => {
    const key = Object.keys(files).find((k) => k.toLowerCase() === name.toLowerCase());
    const f = key === undefined ? undefined : files[key];
    return f === undefined ? null : new TextDecoder().decode(f);
  };

  const workbook = text("xl/workbook.xml") ?? "";
  const date1904 = /date1904="(1|true)"/i.test(workbook);
  // The first sheet in the workbook's order, through its relationship id.
  const firstSheet = el("sheet", "").exec(workbook);
  const rid = attr(firstSheet?.[1], "id");
  const rels = text("xl/_rels/workbook.xml.rels") ?? "";
  let target: string | null = null;
  for (const m of rels.matchAll(el("Relationship"))) if (attr(m[1], "Id") === rid) target = attr(m[1], "Target");
  const path = target === null ? "xl/worksheets/sheet1.xml" : target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  const sheet = text(path) ?? text("xl/worksheets/sheet1.xml");
  if (sheet === null) throw new SheetError("This spreadsheet has no sheet to read.");

  const shared = [...(text("xl/sharedStrings.xml") ?? "").matchAll(el("si"))].map((m) => textOf(m[2] ?? ""));
  const dates = dateStyles(text("xl/styles.xml"));

  const rows: string[][] = [];
  for (const r of sheet.matchAll(el("row"))) {
    const cells: string[] = [];
    let next = 0;
    for (const c of (r[2] ?? "").matchAll(el("c"))) {
      const ref = attr(c[1], "r");
      const at = ref === null ? next : colIndex(ref);
      next = at + 1;
      const type = attr(c[1], "t") ?? "n";
      const inner = c[2] ?? "";
      const v = decode(el("v", "").exec(inner)?.[2] ?? "");
      let value: string;
      if (type === "s") value = shared[Number(v)] ?? "";
      else if (type === "inlineStr") value = textOf(el("is", "").exec(inner)?.[2] ?? "");
      else if (type === "str" || type === "e") value = v;
      else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
      else if (v === "") value = "";
      else if (dates.has(Number(attr(c[1], "s") ?? "0"))) value = serialToDay(v, date1904) ?? numberText(v);
      else value = numberText(v);
      while (cells.length < at) cells.push("");
      cells[at] = value.trim();
    }
    rows.push(cells);
  }
  return rows.filter((r) => r.some((v) => v !== ""));
}

/** The largest <table> of an HTML page, as rows of text (an ".xls" that is really a web page). */
export function readHtmlTable(bytes: Uint8Array): string[][] {
  const html = new TextDecoder().decode(bytes);
  let best: string[][] = [];
  for (const t of html.matchAll(el("table"))) {
    const rows = [...(t[2] ?? "").matchAll(el("tr"))].map((tr) =>
      [...(tr[2] ?? "").matchAll(/<(td|th)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].map((cell) =>
        decode((cell[3] ?? "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, ""))
          .replace(/\s+/g, " ")
          .trim(),
      ),
    );
    if (rows.length > best.length) best = rows;
  }
  return best.filter((r) => r.some((v) => v !== ""));
}
