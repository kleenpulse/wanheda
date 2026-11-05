import { z } from "zod";
import { parseAmount, type Currency } from "../currency";
import { daysInMonth, type Day } from "../dates";
import { PAYEE_MAX } from "../money";

// The generic statement mapper (SPEC T37). A mapping names the columns by
// their header text, so a saved one (`import_mapping.columns`) still fits when
// a bank reorders them. Pure: the import worker runs it, and so do the tests.

/** Which way round a numeric date is. ISO and named-month dates need no order. */
export type DateOrder = "dmy" | "mdy";

export const amountMappingSchema = z.discriminatedUnion("kind", [
  /** One column. `outflow` says which sign the bank gives money out (cards often show charges as positive). */
  z.object({ kind: z.literal("signed"), column: z.string().min(1), outflow: z.enum(["negative", "positive"]) }),
  /** A debit (money out) and a credit (money in) column. */
  z.object({ kind: z.literal("split"), out: z.string().min(1), in: z.string().min(1) }),
  /** An unsigned amount and a column whose "debit" / "dr" / "withdrawal" marks money out (Capital One 360). */
  z.object({ kind: z.literal("typed"), column: z.string().min(1), type: z.string().min(1) }),
]);

export const columnMappingSchema = z
  .object({
    date: z.string().min(1),
    dateOrder: z.enum(["dmy", "mdy"]),
    amount: amountMappingSchema,
    /** One or more columns, joined: some banks split the narration in two. */
    payee: z.array(z.string().min(1)).min(1).max(3),
    balance: z.string().min(1).nullable(),
    reference: z.string().min(1).nullable(),
  })
  .strict();

export type ColumnMapping = z.infer<typeof columnMappingSchema>;

/** One statement line, ready to become a txn. `rowNo` counts from 1 in the file's non-blank lines. */
export interface StatementRow {
  rowNo: number;
  postedOn: Day;
  /** < 0 is money out (V25). */
  amountMinor: number;
  payee: string;
  balanceMinor: number | null;
  reference: string | null;
}

export interface SkippedRow {
  rowNo: number;
  reason: string;
}

// ---------------------------------------------------------------- dates

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function monthOf(name: string): number | null {
  const i = MONTHS.indexOf(name.slice(0, 3).toLowerCase());
  return i === -1 ? null : i + 1;
}

function dayOf(y: number, m: number, d: number): Day | null {
  const year = y < 100 ? 2000 + y : y;
  if (year < 1900 || year > 2200 || m < 1 || m > 12 || d < 1 || d > daysInMonth(year, m)) return null;
  return `${String(year)}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const ISO = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:$|[\sT])/;
const D_MON_Y = /^(\d{1,2})[-\s/.]+([a-z]{3,9})\.?[-\s/.,]+(\d{2}|\d{4})(?:$|[\s,T])/i;
const MON_D_Y = /^([a-z]{3,9})\.?[-\s/.]+(\d{1,2})(?:st|nd|rd|th)?,?[-\s/.]+(\d{2}|\d{4})(?:$|[\s,T])/i;
const NUMERIC = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:$|[\s,T])/;
const WEEKDAY = /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/i;

/** A statement date as a calendar day, the time dropped (V27). Null when it isn't one. */
export function parseStatementDate(text: string, order: DateOrder): Day | null {
  const t = text.trim().replace(WEEKDAY, "");
  let m = ISO.exec(t);
  if (m) return dayOf(Number(m[1]), Number(m[2]), Number(m[3]));
  m = D_MON_Y.exec(t);
  if (m) {
    const mo = monthOf(m[2] ?? "");
    return mo === null ? null : dayOf(Number(m[3]), mo, Number(m[1]));
  }
  m = MON_D_Y.exec(t);
  if (m) {
    const mo = monthOf(m[1] ?? "");
    return mo === null ? null : dayOf(Number(m[3]), mo, Number(m[2]));
  }
  m = NUMERIC.exec(t);
  if (m) {
    const [a, b, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return order === "dmy" ? dayOf(y, b, a) : dayOf(y, a, b);
  }
  return null;
}

/**
 * Day-first or month-first, from the dates themselves: a first part over 12
 * means day-first, a second part over 12 month-first. Only when every date
 * fits both does the currency decide (USD statements are month-first).
 */
export function guessDateOrder(samples: readonly string[], currency: Currency): DateOrder {
  for (const s of samples) {
    const m = NUMERIC.exec(s.trim().replace(WEEKDAY, ""));
    if (!m) continue;
    if (Number(m[1]) > 12) return "dmy";
    if (Number(m[2]) > 12) return "mdy";
  }
  return currency === "USD" ? "mdy" : "dmy";
}

// ---------------------------------------------------------------- amounts

/**
 * A statement amount in minor units, signed as written: "-1,250.00",
 * "(1,250.00)", "1,250.00 DR" and "1,250.00-" are money out; "CR" and plain
 * numbers are as given. Currency symbols and codes are dropped. Digit-string
 * maths only (V25). Empty or "-" is 0; anything else unreadable is null.
 */
export function parseStatementAmount(text: string, currency: Currency): number | null {
  let t = text.trim().replace(/\s+/g, " ");
  if (t === "" || t === "-" || t === "--") return 0;
  let negative = false;
  if (/^\(.*\)$/.test(t)) {
    negative = true;
    t = t.slice(1, -1).trim();
  }
  const mark = /\s*(dr|cr|db)\.?$/i.exec(t);
  if (mark) {
    if (mark[1]?.toLowerCase() !== "cr") negative = !negative;
    t = t.slice(0, mark.index).trim();
  }
  if (t.endsWith("-")) {
    negative = !negative;
    t = t.slice(0, -1).trim();
  }
  if (t.startsWith("+")) t = t.slice(1).trim();
  else if (t.startsWith("-")) {
    negative = !negative;
    t = t.slice(1).trim();
  }
  // Symbols and codes, either side: ₦ $ € £ NGN USD, and a bare N before digits on some NG statements.
  t = t.replace(/^(?:[a-z]{3}|us\$|[₦$€£¥]|n(?=[\d.]))\s*/i, "").replace(/\s*(?:[a-z]{3}|[₦$€£¥])$/i, "");
  if (t.startsWith("-")) {
    negative = !negative;
    t = t.slice(1);
  }
  t = t.replace(/\s/g, "");
  if (!/^[\d.,]+$/.test(t)) return null;
  const minor = parseAmount(t, currency);
  if (minor === null) return null;
  return negative && minor !== 0 ? -minor : minor;
}

// ---------------------------------------------------------------- headers

const HEADER_WORDS = {
  date: /^(trans(action)?\.?\s*(date|time)|txn\.?\s*date|date|posting\s*date|post(ed)?\s*date|booking\s*date|date\s*\/\s*time|created\s*at|value\s*date)$/i,
  amount: /^(amount|amount\s*\(.*\)|transaction\s*amount|amt)$/i,
  out: /^(debit|debits|debit\s*amount|withdrawals?|withdrawal\s*amount|money\s*out|paid\s*out|dr|outflow|debit\s*\(.*\))$/i,
  in: /^(credit|credits|credit\s*amount|deposits?|deposit\s*amount|money\s*in|paid\s*in|cr|inflow|credit\s*\(.*\))$/i,
  balance: /^(balance|running\s*bal(ance)?\.?|available\s*balance|ledger\s*balance|closing\s*balance|balance\s*after.*|balance\s*\(.*\))$/i,
  reference: /^(ref(erence)?(\s*(no|number|id))?\.?|transaction\s*(id|ref(erence)?)|txn\s*id|trans(action)?\s*ref|session\s*id|receipt\s*(no|number))$/i,
  type: /^(transaction\s*type|type|details|dr\s*\/\s*cr)$/i,
} as const;

/** Payee columns, best first: one is picked, so a "Details" of DEBIT/CREDIT or a multi-line "Extended Details" never joins in. */
const PAYEE_WORDS: readonly RegExp[] = [
  /^(payee|to\s*\/\s*from|merchant|beneficiary|counterparty)$/i,
  /^(transaction\s*)?(description|narration|narrative|remarks?)$/i,
  /^(appears\s*on\s*your\s*statement\s*as|name|memo)$/i,
  /(description|narration|remarks?|payee)/i,
];

/** The first of the opening lines that looks like a header: a date column plus an amount, debit or credit column. */
export function findHeaderRow(rows: readonly (readonly string[])[]): number | null {
  for (let i = 0; i < Math.min(rows.length, 50); i++) {
    const cells = rows[i] ?? [];
    const hasDate = cells.some((c) => HEADER_WORDS.date.test(c));
    const hasMoney = cells.some((c) => HEADER_WORDS.amount.test(c) || HEADER_WORDS.out.test(c) || HEADER_WORDS.in.test(c));
    if (hasDate && hasMoney) return i;
  }
  return null;
}

/** The table in a file: its column names and the line they came from (null when the file has no header, like Wells Fargo's). */
export interface Table {
  header: string[];
  headerRow: number | null;
}

/** The header row, or "Column 1" … "Column N" when the file has none. */
export function readTable(rows: readonly (readonly string[])[]): Table {
  const headerRow = findHeaderRow(rows);
  if (headerRow !== null) {
    // Blank or repeated names ("Unnamed" spacer columns) get a stand-in, so every column has its own name.
    const seen = new Set<string>();
    const header = (rows[headerRow] ?? []).map((h, i) => {
      const name = h === "" || seen.has(h) ? `Column ${String(i + 1)}` : h;
      seen.add(name);
      return name;
    });
    return { header, headerRow };
  }
  const width = Math.max(0, ...rows.slice(0, 50).map((r) => r.length));
  return { header: Array.from({ length: width }, (_, i) => `Column ${String(i + 1)}`), headerRow: null };
}

const DIRECTION = /^(debit|credit|dr|cr|withdrawal|deposit)$/i;

/** A first mapping from the header names, or from the cells when there are none. The owner checks it in the preview. */
export function guessMapping(table: Table, body: readonly (readonly string[])[], currency: Currency): ColumnMapping | null {
  const { header } = table;
  const sample = body.slice(0, 50);
  const values = (h: string) => sample.map((r) => r[header.indexOf(h)] ?? "").filter((v) => v !== "");
  const share = (h: string, test: (v: string) => boolean) => {
    const vs = values(h);
    return vs.length === 0 ? 0 : vs.filter(test).length / vs.length;
  };
  const isDate = (v: string) => parseStatementDate(v, "dmy") !== null || parseStatementDate(v, "mdy") !== null;
  const isAmount = (v: string) => /\d/.test(v) && parseStatementAmount(v, currency) !== null;
  const pick = (re: RegExp, except: readonly string[] = []) => header.find((h) => re.test(h) && !except.includes(h)) ?? null;

  let date: string | null;
  let out: string | null = null;
  let inn: string | null = null;
  let signed: string | null;
  if (table.headerRow === null) {
    date = header.find((h) => share(h, isDate) >= 0.8) ?? null;
    signed = header.find((h) => h !== date && share(h, isAmount) >= 0.8) ?? null;
  } else {
    // Transaction date before value date when a statement has both.
    date = header.find((h) => HEADER_WORDS.date.test(h) && !/value/i.test(h)) ?? pick(HEADER_WORDS.date);
    out = pick(HEADER_WORDS.out);
    inn = pick(HEADER_WORDS.in);
    signed = pick(HEADER_WORDS.amount);
  }
  if (date === null) return null;
  const type = signed === null ? null : pick(HEADER_WORDS.type, [date, signed]);
  let amount: ColumnMapping["amount"] | null = null;
  if (out !== null && inn !== null) amount = { kind: "split", out, in: inn };
  else if (signed !== null) {
    const unsigned = values(signed).every((v) => (parseStatementAmount(v, currency) ?? 0) >= 0);
    amount =
      type !== null && unsigned && share(type, (v) => DIRECTION.test(v)) >= 0.8
        ? { kind: "typed", column: signed, type }
        : { kind: "signed", column: signed, outflow: "negative" };
  }
  if (amount === null) return null;
  const used = [date, out, inn, signed, amount.kind === "typed" ? amount.type : null].filter((h): h is string => h !== null);
  const balance = pick(HEADER_WORDS.balance, used);
  const reference = pick(HEADER_WORDS.reference, used);
  const free = header.filter((h) => !used.includes(h) && h !== balance && h !== reference);
  let payee: string | undefined;
  if (table.headerRow === null) {
    // No names: the column with the longest text.
    const length = (h: string) => values(h).reduce((n, v) => n + v.length, 0);
    payee = [...free].sort((a, b) => length(b) - length(a))[0];
  } else {
    for (const re of PAYEE_WORDS) {
      payee = free.find((h) => re.test(h));
      if (payee !== undefined) break;
    }
  }
  const dateCol = header.indexOf(date);
  return {
    date,
    dateOrder: guessDateOrder(
      sample.map((r) => r[dateCol] ?? ""),
      currency,
    ),
    amount,
    payee: [payee ?? free[0] ?? date],
    balance,
    reference,
  };
}

// ---------------------------------------------------------------- rows

function amountColumns(a: ColumnMapping["amount"]): string[] {
  switch (a.kind) {
    case "signed":
      return [a.column];
    case "split":
      return [a.out, a.in];
    case "typed":
      return [a.column, a.type];
  }
}

/** Column names the mapping uses that the file doesn't have. Empty = the mapping fits. */
export function missingColumns(header: readonly string[], m: ColumnMapping): string[] {
  const wanted = [m.date, ...amountColumns(m.amount), ...m.payee, m.balance, m.reference];
  return wanted.filter((h): h is string => h !== null && !header.includes(h));
}

/**
 * Every line under the header, mapped. A line that isn't a txn (an opening
 * balance, a total, a page footer) is listed as skipped with its reason,
 * never dropped quietly (V32).
 */
export function mapRows(
  rows: readonly (readonly string[])[],
  table: Table,
  m: ColumnMapping,
  currency: Currency,
): { rows: StatementRow[]; skipped: SkippedRow[] } {
  const col = (name: string | null) => (name === null ? -1 : table.header.indexOf(name));
  const dateCol = col(m.date);
  const payeeCols = m.payee.map(col);
  const balanceCol = col(m.balance);
  const refCol = col(m.reference);
  const out: StatementRow[] = [];
  const skipped: SkippedRow[] = [];

  for (let i = (table.headerRow ?? -1) + 1; i < rows.length; i++) {
    const cells = rows[i] ?? [];
    const rowNo = i + 1;
    const at = (c: number) => (c < 0 ? "" : (cells[c] ?? ""));
    const postedOn = parseStatementDate(at(dateCol), m.dateOrder);
    if (postedOn === null) {
      skipped.push({ rowNo, reason: at(dateCol) === "" ? "No date" : `Not a date: "${at(dateCol).slice(0, 40)}"` });
      continue;
    }
    let amountMinor: number | null;
    if (m.amount.kind === "signed") {
      const v = parseStatementAmount(at(col(m.amount.column)), currency);
      amountMinor = v === null ? null : m.amount.outflow === "positive" ? -v : v;
    } else if (m.amount.kind === "typed") {
      const v = parseStatementAmount(at(col(m.amount.column)), currency);
      const kind = at(col(m.amount.type));
      if (v !== null && !DIRECTION.test(kind)) {
        skipped.push({ rowNo, reason: `Not a debit or credit: "${kind.slice(0, 20)}"` });
        continue;
      }
      amountMinor = v === null ? null : /^(debit|dr|withdrawal)$/i.test(kind) ? -Math.abs(v) : Math.abs(v);
    } else {
      const o = parseStatementAmount(at(col(m.amount.out)), currency);
      const n = parseStatementAmount(at(col(m.amount.in)), currency);
      if (o === null || n === null) amountMinor = null;
      else if (o !== 0 && n !== 0) {
        skipped.push({ rowNo, reason: "Both a debit and a credit" });
        continue;
      } else amountMinor = o !== 0 ? -Math.abs(o) : Math.abs(n);
    }
    if (amountMinor === null) {
      skipped.push({ rowNo, reason: "Not an amount" });
      continue;
    }
    if (amountMinor === 0) {
      skipped.push({ rowNo, reason: "No amount" });
      continue;
    }
    const balance = balanceCol < 0 ? null : parseStatementAmount(at(balanceCol), currency);
    const reference = refCol < 0 ? "" : at(refCol);
    out.push({
      rowNo,
      postedOn,
      amountMinor,
      // Cut to what a txn holds, here, so the row key is always of the stored payee.
      payee: payeeCols
        .map(at)
        .filter((p) => p !== "")
        .join(" · ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, PAYEE_MAX)
        .trim(),
      balanceMinor: balanceCol < 0 || at(balanceCol) === "" ? null : balance,
      reference: reference === "" ? null : reference,
    });
  }
  return { rows: out, skipped };
}
