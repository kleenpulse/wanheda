import type { Budget } from "./budgets";
import { toDecimalString, type Currency } from "./currency";
import type { Day } from "./dates";
import { byId, categoryPath, type Account, type Category, type Txn } from "./money";
import type { Rule } from "./rules";
import type { Subscription } from "./subscriptions";

// Export (FR-MONEY-18): everything, as CSV (the ledger, one row per entry)
// or JSON (every table). Amounts go out twice: exact minor units and a
// decimal string, never a float (V25).

export const EXPORT_FORMATS = ["csv", "json"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export interface MoneyExport {
  exportedAt: string;
  baseCurrency: Currency;
  timeZone: string;
  accounts: Account[];
  categories: Category[];
  txns: Txn[];
  subscriptions: Subscription[];
  budgets: Budget[];
  rules: Rule[];
}

const CSV_HEAD = ["date", "amount", "currency", "amount_minor", "payee", "category", "account", "tags", "note", "source", "id"] as const;

/**
 * One CSV field: quoted when it holds a comma, quote or line break. Text a
 * spreadsheet would run as a formula (= + - @, tab, CR) gets a leading
 * apostrophe, so an imported payee can never become a formula.
 */
export function csvField(value: string, text = true): string {
  const safe = text && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** The ledger as CSV, oldest first, with a header row. CRLF line ends, as RFC 4180 has them. */
export function toCsv(data: Pick<MoneyExport, "txns" | "categories" | "accounts">): string {
  const categories = byId(data.categories);
  const accounts = byId(data.accounts);
  const rows = [...data.txns]
    .sort((a, b) => (a.postedOn !== b.postedOn ? (a.postedOn < b.postedOn ? -1 : 1) : a.createdAt - b.createdAt))
    .map((t) => {
      const c = t.categoryId ? categories.get(t.categoryId) : undefined;
      return [
        csvField(t.postedOn, false),
        csvField(toDecimalString(t.amountMinor, t.currency), false),
        csvField(t.currency, false),
        csvField(String(t.amountMinor), false),
        csvField(t.payee),
        csvField(c ? categoryPath(c, categories) : ""),
        csvField(accounts.get(t.accountId)?.name ?? ""),
        csvField(t.tags.join(";")),
        csvField(t.note),
        csvField(t.source, false),
        csvField(t.id, false),
      ].join(",");
    });
  return [CSV_HEAD.join(","), ...rows].join("\r\n") + "\r\n";
}

/** Every table as JSON. Each txn also carries its amount as a decimal string. */
export function toJson(data: MoneyExport): string {
  return JSON.stringify(
    {
      ...data,
      txns: data.txns.map((t) => ({ ...t, amount: toDecimalString(t.amountMinor, t.currency) })),
    },
    null,
    2,
  );
}

export function exportFilename(format: ExportFormat, today: Day): string {
  return `wanheda-money-${today}.${format}`;
}
