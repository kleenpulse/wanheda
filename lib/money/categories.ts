// Categories (FR-MONEY-4): two levels, an emoji and a data-palette colour
// (never the signal hue, SPEC V29). The default set is seeded once per owner;
// slugs are stored, so never rename one. Aliases are what quick-add matches
// ("4500 chop" → Food & drink), on top of the name itself.

export const CATEGORY_COLORS = ["blue", "aqua", "yellow", "magenta", "green", "violet", "red", "cyan", "slate"] as const;
export type CategoryColor = (typeof CATEGORY_COLORS)[number];

export const CATEGORY_KINDS = ["expense", "income", "transfer"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export function isCategoryColor(value: unknown): value is CategoryColor {
  return typeof value === "string" && (CATEGORY_COLORS as readonly string[]).includes(value);
}

export function isCategoryKind(value: unknown): value is CategoryKind {
  return typeof value === "string" && (CATEGORY_KINDS as readonly string[]).includes(value);
}

export interface DefaultCategory {
  slug: string;
  name: string;
  emoji: string;
  color: CategoryColor;
  kind: CategoryKind;
  parent?: string;
  aliases?: readonly string[];
}

export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  { slug: "food", name: "Food & drink", emoji: "🍲", color: "yellow", kind: "expense", aliases: ["food", "eat", "lunch", "dinner", "breakfast", "chop", "drink", "drinks"] },
  { slug: "food-out", name: "Eating out", emoji: "🍽️", color: "yellow", kind: "expense", parent: "food", aliases: ["restaurant", "eatingout"] },
  { slug: "groceries", name: "Groceries", emoji: "🛒", color: "green", kind: "expense", aliases: ["grocery", "market", "foodstuff"] },
  { slug: "transport", name: "Transport", emoji: "🚕", color: "blue", kind: "expense", aliases: ["transport", "taxi", "bus", "ride", "uber", "bolt"] },
  { slug: "fuel", name: "Fuel", emoji: "⛽", color: "blue", kind: "expense", parent: "transport", aliases: ["fuel", "petrol", "gas", "diesel"] },
  { slug: "bills", name: "Bills & utilities", emoji: "💡", color: "cyan", kind: "expense", aliases: ["bill", "bills", "utilities", "electricity", "power", "nepa", "water"] },
  { slug: "airtime", name: "Airtime & data", emoji: "📶", color: "cyan", kind: "expense", parent: "bills", aliases: ["airtime", "data", "recharge", "internet", "wifi"] },
  { slug: "housing", name: "Housing", emoji: "🏠", color: "violet", kind: "expense", aliases: ["rent", "house", "housing"] },
  { slug: "shopping", name: "Shopping", emoji: "🛍️", color: "magenta", kind: "expense", aliases: ["shop", "shopping", "clothes"] },
  { slug: "subscriptions", name: "Subscriptions", emoji: "🔁", color: "violet", kind: "expense", aliases: ["sub", "subs", "subscription"] },
  { slug: "health", name: "Health", emoji: "💊", color: "red", kind: "expense", aliases: ["health", "pharmacy", "drugs", "hospital", "doctor", "gym"] },
  { slug: "fun", name: "Entertainment", emoji: "🎬", color: "magenta", kind: "expense", aliases: ["fun", "movie", "movies", "games", "outing"] },
  { slug: "family", name: "Family & gifts", emoji: "🎁", color: "red", kind: "expense", aliases: ["family", "gift", "gifts", "giving"] },
  { slug: "education", name: "Education", emoji: "📚", color: "aqua", kind: "expense", aliases: ["school", "course", "books", "education"] },
  { slug: "care", name: "Personal care", emoji: "💈", color: "aqua", kind: "expense", aliases: ["haircut", "barber", "salon", "care"] },
  { slug: "travel", name: "Travel", emoji: "✈️", color: "blue", kind: "expense", aliases: ["travel", "flight", "hotel", "trip"] },
  { slug: "fees", name: "Fees & charges", emoji: "🏦", color: "slate", kind: "expense", aliases: ["fee", "fees", "charge", "charges", "stamp"] },
  { slug: "other", name: "Other", emoji: "📦", color: "slate", kind: "expense", aliases: ["other", "misc"] },
  { slug: "salary", name: "Salary", emoji: "💼", color: "green", kind: "income", aliases: ["salary", "pay", "wage"] },
  { slug: "freelance", name: "Freelance", emoji: "💻", color: "aqua", kind: "income", aliases: ["freelance", "client", "gig"] },
  { slug: "business", name: "Business", emoji: "📈", color: "blue", kind: "income", aliases: ["business", "sales", "revenue"] },
  { slug: "gifts-in", name: "Gifts received", emoji: "🎉", color: "magenta", kind: "income", aliases: ["giftin", "received"] },
  { slug: "refund", name: "Refunds", emoji: "↩️", color: "cyan", kind: "income", aliases: ["refund", "reversal", "cashback"] },
  { slug: "income-other", name: "Other income", emoji: "💰", color: "slate", kind: "income", aliases: ["income"] },
  { slug: "transfer", name: "Transfer", emoji: "🔄", color: "slate", kind: "transfer", aliases: ["transfer", "move"] },
];

const DEFAULT_BY_SLUG = new Map(DEFAULT_CATEGORIES.map((c) => [c.slug, c]));

/** Aliases of a seeded category, by its slug. User categories have none. */
export function aliasesOf(slug: string | null): readonly string[] {
  return (slug && DEFAULT_BY_SLUG.get(slug)?.aliases) || [];
}
