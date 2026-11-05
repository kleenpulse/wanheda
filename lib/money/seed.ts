import { DEFAULT_CATEGORIES } from "./categories";
import { addDays, addMonths, daysBetween, DEFAULT_TIME_ZONE, type Day } from "./dates";
import type { NewNotice } from "@/lib/notifications/notifications";
import { compareTxns, type Account, type Category, type MoneyPayload, type Txn } from "./money";
import { alertNotice, blankSubscription, dueAlerts, type Subscription } from "./subscriptions";

// Demo mode's money (G4): about three months of believable NGN spending, a
// USD card with subscriptions, and salary in. Never saved. Built from a fixed
// PRNG relative to `today`, so the same day always shows the same data.

const hex = (n: number) => n.toString(16).padStart(12, "0");
const demoId = (kind: number, n: number) => `00000000-0000-4000-8${String(kind).padStart(3, "0")}-${hex(n)}`;

/** The demo category's id for a default slug: stable, so seed txns can point at it. */
export function demoCategoryId(slug: string): string {
  const i = DEFAULT_CATEGORIES.findIndex((c) => c.slug === slug);
  if (i < 0) throw new Error(`No default category ${slug}`);
  return demoId(1, i + 1);
}

export function demoCategories(): Category[] {
  return DEFAULT_CATEGORIES.map((c) => ({
    id: demoCategoryId(c.slug),
    slug: c.slug,
    name: c.name,
    parentId: c.parent ? demoCategoryId(c.parent) : null,
    emoji: c.emoji,
    color: c.color,
    kind: c.kind,
    archived: false,
  }));
}

export const DEMO_ACCOUNTS: readonly Account[] = [
  { id: demoId(2, 1), slug: "cash", name: "Cash", kind: "cash", currency: "NGN", openingMinor: 2_500_000, archived: false },
  { id: demoId(2, 2), slug: null, name: "Bank", kind: "bank", currency: "NGN", openingMinor: 85_000_000, archived: false },
  { id: demoId(2, 3), slug: null, name: "Dollar card", kind: "card", currency: "USD", openingMinor: 120_000, archived: false },
];

/**
 * Demo's subscriptions, set against today so there is always something due:
 * the card's three monthly charges (the same days as the seed txns), a gym
 * renewing in two days, a trial ending in three, a yearly domain, and one
 * paused and one cancelled to show those states.
 */
export function demoSubscriptions(today: Day): Subscription[] {
  const [, bank, card] = DEMO_ACCOUNTS as [Account, Account, Account];
  const month = today.slice(0, 7);
  const sub = (n: number, s: Partial<Subscription> & Pick<Subscription, "name" | "amountMinor" | "currency" | "anchorOn">): Subscription => ({
    ...blankSubscription(today, s.currency),
    id: demoId(4, n),
    categoryId: demoCategoryId("subscriptions"),
    createdAt: Date.parse(`${addMonths(today, -2)}T12:00:00Z`) + n,
    ...s,
  });
  return [
    sub(1, { name: "Netflix", amountMinor: 1_549, currency: "USD", anchorOn: `${month}-05`, accountId: card.id, cancelUrl: "https://www.netflix.com/cancelplan" }),
    sub(2, { name: "Spotify", amountMinor: 1_199, currency: "USD", anchorOn: `${month}-12`, accountId: card.id }),
    sub(3, { name: "Claude", amountMinor: 2_000, currency: "USD", anchorOn: `${month}-18`, accountId: card.id }),
    sub(4, { name: "Gym", amountMinor: 2_500_000, currency: "NGN", anchorOn: addDays(today, 2), accountId: bank.id, categoryId: demoCategoryId("health") }),
    sub(5, { name: "Design tool", amountMinor: 1_500, currency: "USD", anchorOn: addDays(today, 3), trialEndsOn: addDays(today, 3), accountId: card.id }),
    sub(6, { name: "Domain", amountMinor: 1_800, currency: "USD", cycle: "year", anchorOn: addDays(today, 40), accountId: card.id, remindDays: 14 }),
    sub(7, { name: "Language app", amountMinor: 450_000, currency: "NGN", anchorOn: `${month}-09`, status: "paused", accountId: bank.id, categoryId: demoCategoryId("education") }),
    sub(8, { name: "Cloud storage", amountMinor: 299, currency: "USD", anchorOn: `${month}-20`, status: "cancelled", accountId: card.id }),
  ];
}

/** The reminders demo's subscriptions raise today, for demo's notification centre (never saved). */
export function demoMoneyAlerts(today: Day): NewNotice[] {
  return dueAlerts(demoSubscriptions(today), today).map(alertNotice);
}

/** mulberry32: small, fast, deterministic. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Draft {
  on: Day;
  minor: number;
  account: Account;
  slug: string | null;
  payee: string;
  note?: string;
}

function seedDay(day: Day): number {
  return Number(day.replaceAll("-", "")) % 2_147_483_647;
}

export function seedMoney(today: Day, timeZone = DEFAULT_TIME_ZONE): MoneyPayload {
  const [cash, bank, card] = DEMO_ACCOUNTS as [Account, Account, Account];
  const since = addMonths(today, -2);
  const days = daysBetween(since, today);
  // Seeded by the month, so the data only reshuffles when a month turns.
  const rand = prng(seedDay(since));
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
  const naira = (lo: number, hi: number, step = 50) => Math.round((lo + rand() * (hi - lo)) / step) * step * 100;
  const drafts: Draft[] = [];

  for (let i = 0; i <= days; i++) {
    const on = addDays(since, i);
    const dom = Number(on.slice(8));
    if (rand() < 0.8) drafts.push({ on, minor: -naira(1500, 6500), account: pick([cash, bank]), slug: "food", payee: pick(["Jollof spot", "Mama Put", "Chicken Republic", "Suya", "Shawarma"]) });
    if (rand() < 0.55) drafts.push({ on, minor: -naira(1200, 5200), account: bank, slug: "transport", payee: pick(["Uber", "Bolt", "Bolt", "Keke"]) });
    if (rand() < 0.15) drafts.push({ on, minor: -naira(9000, 42000, 500), account: bank, slug: "groceries", payee: pick(["Shoprite", "Market", "Spar"]) });
    if (rand() < 0.08) drafts.push({ on, minor: -naira(2000, 5000, 500), account: bank, slug: "airtime", payee: pick(["MTN", "Airtel"]) });
    if (rand() < 0.06) drafts.push({ on, minor: -naira(15000, 30000, 1000), account: bank, slug: "fuel", payee: "Filling station" });
    if (rand() < 0.05) {
      const [slug, payee] = pick([["shopping", "Jumia"], ["shopping", "Ikeja City Mall"], ["fun", "Cinema"], ["care", "Barber"], ["health", "Pharmacy"]] as const);
      drafts.push({ on, minor: -naira(8000, 60000, 500), account: bank, slug, payee });
    }
    if (rand() < 0.12) drafts.push({ on, minor: -5000, account: bank, slug: "fees", payee: "Bank charges", note: "Transfer fee" });
    if (dom === 1) drafts.push({ on, minor: -35_000_000, account: bank, slug: "housing", payee: "Rent (monthly)" });
    if (dom === 3) drafts.push({ on, minor: -naira(18000, 26000, 500), account: bank, slug: "bills", payee: "Electricity" });
    if (dom === 5) drafts.push({ on, minor: -1_549, account: card, slug: "subscriptions", payee: "Netflix" });
    if (dom === 12) drafts.push({ on, minor: -1_199, account: card, slug: "subscriptions", payee: "Spotify" });
    if (dom === 18) drafts.push({ on, minor: -2_000, account: card, slug: "subscriptions", payee: "Claude" });
    if (dom === 25) drafts.push({ on, minor: 180_000_000, account: bank, slug: "salary", payee: "Salary" });
    if (dom === 15) drafts.push({ on, minor: 85_000, account: card, slug: "freelance", payee: "Client invoice" });
  }

  const txns: Txn[] = drafts.map((d, n) => ({
    id: demoId(3, n + 1),
    accountId: d.account.id,
    postedOn: d.on,
    amountMinor: d.minor,
    currency: d.account.currency,
    payee: d.payee,
    categoryId: d.slug ? demoCategoryId(d.slug) : null,
    note: d.note ?? "",
    tags: [],
    source: "manual",
    transferId: null,
    // Entry time: noon of that day plus the draft order, so same-day rows keep a stable order.
    createdAt: Date.parse(`${d.on}T12:00:00Z`) + n,
  }));
  txns.sort(compareTxns);

  return {
    source: "demo",
    baseCurrency: "NGN",
    timeZone,
    since,
    accounts: [...DEMO_ACCOUNTS],
    categories: demoCategories(),
    txns,
    // The demo ledger starts at the window, so opening balances are all there is before it.
    priorMinor: {},
    subscriptions: demoSubscriptions(today),
  };
}
