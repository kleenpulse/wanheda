import type { Currency } from "../currency";
import type { ColumnMapping, Table } from "./mapping";

// Bank presets (SPEC T37). Built from public descriptions of each bank's
// export (importer configs and sample headers; no bank documents its columns),
// not yet from the owner's own files, so every import still shows a preview to
// confirm. "unverified" presets rest on a single source. Access Bank and Zenith
// (Nigeria) export PDF only, so they have none.

export type PresetConfidence = "observed" | "unverified";

export interface BankPreset {
  id: string;
  name: string;
  country: "NG" | "US";
  currency: Currency;
  confidence: PresetConfidence;
  /** Header sets that identify the export; any one matches. Empty = never picked by itself (choose it by hand). */
  signatures: readonly (readonly string[])[];
  /** A headerless file this wide (Wells Fargo). */
  headerlessWidth?: number;
  /** The mapping, given a lookup from a column name to the file's own spelling of it. */
  mapping: (col: (name: string) => string | null) => ColumnMapping | null;
}

const norm = (h: string) => h.toLowerCase().replace(/\s+/g, " ").trim();

function signed(date: string, column: string, payee: string, extra: Partial<ColumnMapping> = {}): ColumnMapping {
  return { date, dateOrder: "mdy", amount: { kind: "signed", column, outflow: "negative" }, payee: [payee], balance: null, reference: null, ...extra };
}

export const PRESETS: readonly BankPreset[] = [
  {
    id: "chase-checking",
    name: "Chase checking",
    country: "US",
    currency: "USD",
    confidence: "observed",
    signatures: [["Details", "Posting Date", "Description", "Amount", "Type", "Balance"]],
    mapping: (col) => {
      const [d, a, p, b] = [col("Posting Date"), col("Amount"), col("Description"), col("Balance")];
      return d && a && p ? signed(d, a, p, { balance: b }) : null;
    },
  },
  {
    id: "chase-card",
    name: "Chase credit card",
    country: "US",
    currency: "USD",
    confidence: "observed",
    // Charges are negative in this export (three sources; one says otherwise): the preview shows the sign.
    signatures: [["Transaction Date", "Post Date", "Description", "Category", "Type", "Amount"]],
    mapping: (col) => {
      const [d, a, p] = [col("Transaction Date"), col("Amount"), col("Description")];
      return d && a && p ? signed(d, a, p) : null;
    },
  },
  {
    id: "bofa-checking",
    name: "Bank of America checking",
    country: "US",
    currency: "USD",
    confidence: "observed",
    signatures: [["Date", "Description", "Amount", "Running Bal."]],
    mapping: (col) => {
      const [d, a, p, b] = [col("Date"), col("Amount"), col("Description"), col("Running Bal.")];
      return d && a && p ? signed(d, a, p, { balance: b }) : null;
    },
  },
  {
    id: "bofa-card",
    name: "Bank of America credit card",
    country: "US",
    currency: "USD",
    confidence: "unverified",
    signatures: [["Posted Date", "Reference Number", "Payee", "Amount"]],
    mapping: (col) => {
      const [d, a, p, r] = [col("Posted Date"), col("Amount"), col("Payee"), col("Reference Number")];
      return d && a && p ? signed(d, a, p, { reference: r }) : null;
    },
  },
  {
    id: "wells-fargo",
    name: "Wells Fargo",
    country: "US",
    currency: "USD",
    confidence: "observed",
    // No header row: date, amount, "*", blank, description.
    signatures: [],
    headerlessWidth: 5,
    mapping: (col) => {
      const [d, a, p] = [col("Column 1"), col("Column 2"), col("Column 5")];
      return d && a && p ? signed(d, a, p) : null;
    },
  },
  {
    id: "amex",
    name: "American Express",
    country: "US",
    currency: "USD",
    confidence: "observed",
    // Charges are positive. A bare "Date, Description, Amount" file could be any bank, so only the
    // card-member or extended exports pick this by themselves.
    signatures: [
      ["Date", "Description", "Card Member", "Amount"],
      ["Date", "Description", "Amount", "Extended Details"],
    ],
    mapping: (col) => {
      const [d, a, p, r] = [col("Date"), col("Amount"), col("Description"), col("Reference")];
      return d && a && p ? { ...signed(d, a, p, { reference: r }), amount: { kind: "signed", column: a, outflow: "positive" } } : null;
    },
  },
  {
    id: "capital-one-card",
    name: "Capital One credit card",
    country: "US",
    currency: "USD",
    confidence: "observed",
    signatures: [["Transaction Date", "Posted Date", "Card No.", "Description", "Debit", "Credit"]],
    mapping: (col) => {
      const [d, o, i, p] = [col("Transaction Date"), col("Debit"), col("Credit"), col("Description")];
      return d && o && i && p ? { date: d, dateOrder: "mdy", amount: { kind: "split", out: o, in: i }, payee: [p], balance: null, reference: null } : null;
    },
  },
  {
    id: "capital-one-360",
    name: "Capital One 360",
    country: "US",
    currency: "USD",
    confidence: "unverified",
    signatures: [["Transaction Description", "Transaction Date", "Transaction Type", "Transaction Amount", "Balance"]],
    mapping: (col) => {
      const [d, a, t, p, b] = [col("Transaction Date"), col("Transaction Amount"), col("Transaction Type"), col("Transaction Description"), col("Balance")];
      return d && a && t && p ? { date: d, dateOrder: "mdy", amount: { kind: "typed", column: a, type: t }, payee: [p], balance: b, reference: null } : null;
    },
  },
  {
    id: "gtbank",
    name: "GTBank",
    country: "NG",
    currency: "NGN",
    confidence: "observed",
    signatures: [
      ["Trans. Date", "Reference", "Debits", "Credits", "Balance", "Remarks"],
      ["Trans Date", "Reference", "Debit", "Credit", "Balance", "Remarks"],
    ],
    mapping: (col) => {
      const d = col("Trans. Date") ?? col("Trans Date");
      const o = col("Debits") ?? col("Debit");
      const i = col("Credits") ?? col("Credit");
      const p = col("Remarks");
      return d && o && i && p ? { date: d, dateOrder: "dmy", amount: { kind: "split", out: o, in: i }, payee: [p], balance: col("Balance"), reference: col("Reference") } : null;
    },
  },
  {
    id: "kuda",
    name: "Kuda",
    country: "NG",
    currency: "NGN",
    confidence: "observed",
    signatures: [["Date/Time", "Money In", "Money Out", "To / From", "Balance"]],
    mapping: (col) => {
      const [d, o, i, p] = [col("Date/Time"), col("Money Out"), col("Money In"), col("To / From")];
      return d && o && i && p ? { date: d, dateOrder: "dmy", amount: { kind: "split", out: o, in: i }, payee: [p], balance: col("Balance"), reference: null } : null;
    },
  },
  {
    id: "opay",
    name: "OPay",
    country: "NG",
    currency: "NGN",
    confidence: "observed",
    signatures: [["Trans. Time", "Description", "Debit(₦)", "Credit(₦)", "Transaction Reference"]],
    mapping: (col) => {
      const [d, o, i, p] = [col("Trans. Time"), col("Debit(₦)"), col("Credit(₦)"), col("Description")];
      // "Balance After" skips OWealth moves, so it doesn't chain; the reference keys each row instead.
      return d && o && i && p
        ? { date: d, dateOrder: "dmy", amount: { kind: "split", out: o, in: i }, payee: [p], balance: col("Balance After(₦)"), reference: col("Transaction Reference") }
        : null;
    },
  },
  {
    id: "moniepoint",
    name: "Moniepoint",
    country: "NG",
    currency: "NGN",
    confidence: "unverified",
    signatures: [["Date", "Narration", "Reference", "Debit", "Credit", "Balance"]],
    mapping: (col) => {
      const [d, o, i, p] = [col("Date"), col("Debit"), col("Credit"), col("Narration")];
      return d && o && i && p ? { date: d, dateOrder: "dmy", amount: { kind: "split", out: o, in: i }, payee: [p], balance: col("Balance"), reference: col("Reference") } : null;
    },
  },
];

/** A lookup from a preset's column name to the file's own spelling, ignoring case and spacing. */
export function columnLookup(header: readonly string[]): (name: string) => string | null {
  const byNorm = new Map(header.map((h) => [norm(h), h]));
  return (name) => byNorm.get(norm(name)) ?? null;
}

/** The preset a file's table matches best (the most columns named), or null. */
export function detectPreset(table: Table): { preset: BankPreset; mapping: ColumnMapping } | null {
  const col = columnLookup(table.header);
  let best: { preset: BankPreset; mapping: ColumnMapping; score: number } | null = null;
  for (const preset of PRESETS) {
    let score = 0;
    if (table.headerRow === null) {
      if (preset.headerlessWidth !== table.header.length) continue;
      score = 1;
    } else {
      for (const sig of preset.signatures) if (sig.every((n) => col(n) !== null)) score = Math.max(score, sig.length);
    }
    if (score === 0) continue;
    const mapping = preset.mapping(col);
    if (mapping && (!best || score > best.score)) best = { preset, mapping, score };
  }
  return best && { preset: best.preset, mapping: best.mapping };
}

/** A chosen preset's mapping for this file, or null when its columns aren't there. */
export function presetMapping(preset: BankPreset, table: Table): ColumnMapping | null {
  return preset.mapping(columnLookup(table.header));
}
