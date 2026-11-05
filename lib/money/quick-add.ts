import { aliasesOf } from "./categories";
import { CURRENCIES, parseAmount, type Currency } from "./currency";
import { addDays, type Day } from "./dates";
import { TAGS_MAX, TAG_MAX, PAYEE_MAX, type Account, type Category } from "./money";

// Quick-add (FR-MONEY-3): one line typed into the palette becomes a txn.
//
//   4500 food jollof          → −₦4,500 · Food & drink · "jollof"
//   +50000 salary             → +₦50,000 · Salary
//   50000 salary              → income too: the category says so
//   $12 netflix @card #work   → −$12 on the first USD account named "card…"
//   2.5k uber yesterday       → −₦2,500 · Transport · "uber", dated yesterday
//
// The amount comes first, so nothing else typed into the palette is mistaken
// for money. The first word after it is tried as a category; the rest is the
// payee (an alias like "uber" alone stays the payee too). Pure: the palette shows the result before Enter saves it.

const SYMBOLS: Record<string, Currency> = { "₦": "NGN", $: "USD", "£": "GBP", "€": "EUR" };

export interface QuickAdd {
  amountMinor: number;
  currency: Currency;
  accountId: string;
  categoryId: string | null;
  payee: string;
  tags: string[];
  postedOn: Day;
}

export type QuickAddResult = { ok: true; draft: QuickAdd } | { ok: false; reason: "no-account" | "bad-amount"; currency?: Currency };

export interface QuickAddContext {
  accounts: readonly Account[];
  categories: readonly Category[];
  /** The account used when none is named or implied by a currency symbol. */
  defaultAccountId: string | null;
  today: Day;
}

const LEAD = /^([+-])?([₦$£€])?(\d[\d,._]*(?:\.\d+)?[km]?)$/i;

/** Does this text start like a quick-add? Cheap check for the palette. */
export function looksLikeQuickAdd(input: string): boolean {
  const first = input.trim().split(/\s+/, 1)[0] ?? "";
  return LEAD.test(first);
}

function norm(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
}

/** How a word names a category: by its own name, by an alias, or not at all. */
function categoryMatch(c: Category, word: string): "name" | "alias" | null {
  const w = norm(word);
  if (!w) return null;
  const name = norm(c.name);
  const first = norm(c.name.split(/[\s&›/]+/, 1)[0] ?? "");
  if (name === w || first === w || (c.slug !== null && norm(c.slug) === w)) return "name";
  return aliasesOf(c.slug).includes(w) ? "alias" : null;
}

/** Best category for a word: child before parent (more specific), expense before income unless `income`. */
export function matchCategory(categories: readonly Category[], word: string, income: boolean | null): Category | null {
  const hits = categories.filter((c) => !c.archived && c.kind !== "transfer" && categoryMatch(c, word) !== null);
  if (hits.length === 0) return null;
  const rank = (c: Category) => (income === null ? 0 : (c.kind === "income") === income ? 0 : 2) + (c.parentId ? 0 : 1);
  return [...hits].sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

export function parseQuickAdd(input: string, ctx: QuickAddContext): QuickAddResult | null {
  const words = input.trim().split(/\s+/).filter(Boolean);
  const lead = LEAD.exec(words[0] ?? "");
  if (!lead) return null;
  const [, sign, symbol, amountText = ""] = lead;
  const rest = words.slice(1);

  const open = ctx.accounts.filter((a) => !a.archived);
  let account: Account | undefined;
  let postedOn = ctx.today;
  const tags: string[] = [];
  const text: string[] = [];
  for (const w of rest) {
    const lower = w.toLowerCase();
    if (w.startsWith("@") && w.length > 1) {
      const want = norm(w.slice(1));
      account = open.find((a) => norm(a.name).startsWith(want)) ?? account;
    } else if (lower === "yesterday" || lower === "yday") {
      postedOn = addDays(ctx.today, -1);
    } else if (lower === "today") {
      postedOn = ctx.today;
    } else if (w.startsWith("#") && w.length > 1) {
      const tag = w.slice(1).toLowerCase().slice(0, TAG_MAX);
      if (!tags.includes(tag) && tags.length < TAGS_MAX) tags.push(tag);
    } else {
      text.push(w);
    }
  }

  const symbolCurrency = symbol ? SYMBOLS[symbol] : undefined;
  if (!account) {
    if (symbolCurrency) {
      const fallback = open.find((a) => a.id === ctx.defaultAccountId);
      account = fallback?.currency === symbolCurrency ? fallback : open.find((a) => a.currency === symbolCurrency);
      if (!account) return { ok: false, reason: "no-account", currency: symbolCurrency };
    } else {
      account = open.find((a) => a.id === ctx.defaultAccountId) ?? open[0];
    }
  }
  if (!account) return { ok: false, reason: "no-account" };
  if (symbolCurrency && symbolCurrency !== account.currency) return { ok: false, reason: "no-account", currency: symbolCurrency };
  if (!Object.hasOwn(CURRENCIES, account.currency)) return { ok: false, reason: "bad-amount" };

  const minor = parseAmount(amountText, account.currency);
  if (minor === null || minor === 0) return { ok: false, reason: "bad-amount" };

  const explicitIncome = sign === "+" ? true : sign === "-" ? false : null;
  const word = text[0];
  const category = word ? matchCategory(ctx.categories, word, explicitIncome) : null;
  // "2.5k uber": an alias that is also the only other word is the payee too.
  if (category && word && !(text.length === 1 && categoryMatch(category, word) === "alias")) text.shift();
  const income = explicitIncome ?? category?.kind === "income";

  return {
    ok: true,
    draft: {
      amountMinor: income ? minor : -minor,
      currency: account.currency,
      accountId: account.id,
      categoryId: category?.id ?? null,
      payee: text.join(" ").slice(0, PAYEE_MAX),
      tags,
      postedOn,
    },
  };
}
