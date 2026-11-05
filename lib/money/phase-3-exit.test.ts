import { describe, expect, it } from "vitest";
import { convertedTotals } from "./converted";
import { FxTable } from "./fx";
import { parseCsv } from "./import/csv";
import { analyseStatement, type StatementAnalysis } from "./import/statement";
import { splitByPresence } from "./import/write";
import { moneyAlertsFrom, shortDue } from "./money-alerts";
import { byId, totals, type Category, type Txn } from "./money";
import { detectRecurring, recurringPayee } from "./recurring";
import { alertKey, alertNotice, blankSubscription, dueAlerts, dueLabel, type Subscription } from "./subscriptions";
import type { Notice } from "@/lib/notifications/notifications";

// Phase 3 exit (SPEC T39), one block per exit case. Every expected figure
// below was counted by hand, not by the code under test.

const TODAY = "2026-11-05";
const ACCOUNT = "0b9e1c4e-6f0a-4c39-9a51-2f8d7c3b1a11";
const enc = new TextEncoder();

async function analyse(csv: string): Promise<StatementAnalysis> {
  return analyseStatement(parseCsv(csv), enc.encode(csv), { accountId: ACCOUNT, currency: "NGN", saved: [], mapping: null });
}

function asTxns(a: StatementAnalysis): Txn[] {
  return a.rows.map((r, i) => ({
    id: `imp-${String(i)}`,
    accountId: ACCOUNT,
    postedOn: r.postedOn,
    amountMinor: r.amountMinor,
    currency: "NGN",
    payee: r.payee,
    categoryId: null,
    note: "",
    tags: [],
    source: "import",
    transferId: null,
    createdAt: i,
  }));
}

// Three months of a Nigerian bank statement, day-first dates.
const AUG_OCT = [
  "Date,Description,Amount",
  "01/08/2026,DSTV SUBSCRIPTION,\"-15,700.00\"",
  "03/08/2026,POS SHOPRITE LEKKI,\"-12,345.67\"",
  "05/08/2026,CHICKEN REPUBLIC,\"-3,500.00\"",
  "08/08/2026,NETFLIX.COM,\"-4,400.00\"",
  "11/08/2026,UBER TRIP,\"-2,500.00\"",
  "15/08/2026,MTN DATA BUNDLE,\"-3,000.00\"",
  "19/08/2026,CHICKEN REPUBLIC,\"-6,200.00\"",
  "25/08/2026,SALARY ACME LTD,\"450,000.00\"",
  "02/09/2026,DSTV SUBSCRIPTION,\"-15,700.00\"",
  "08/09/2026,NETFLIX.COM,\"-4,400.00\"",
  "14/09/2026,MTN DATA BUNDLE,\"-3,100.00\"",
  "20/09/2026,POS SHOPRITE LEKKI,\"-8,100.00\"",
  "25/09/2026,SALARY ACME LTD,\"450,000.00\"",
  "01/10/2026,DSTV SUBSCRIPTION,\"-15,700.00\"",
  "03/10/2026,JUMIA ORDER,\"-25,000.00\"",
  "08/10/2026,NETFLIX.COM,\"-4,400.00\"",
  "16/10/2026,MTN DATA BUNDLE,\"-2,950.00\"",
  "24/10/2026,SALARY ACME LTD,\"450,000.00\"",
  "28/10/2026,CHICKEN REPUBLIC,\"-2,000.00\"",
].join("\n");

describe("Phase 3 exit: the same statement twice ⇒ 0 rows, and says so (V12, V32)", () => {
  it("gives the same file key and row keys, so the second pass has nothing new", async () => {
    const first = await analyse(AUG_OCT);
    const again = await analyse(AUG_OCT);
    expect(first.rows).toHaveLength(19);
    expect(first.skipped).toEqual([]);
    // The server refuses a second batch on this key and answers "already" with the first date (import-store.test.ts).
    expect(again.fileKey).toBe(first.fileKey);
    expect(again.rows.map((r) => r.key)).toEqual(first.rows.map((r) => r.key));
    const { fresh, already } = splitByPresence(again.rows, new Set(first.rows.map((r) => r.key)));
    expect(fresh).toHaveLength(0);
    expect(already).toHaveLength(19);
  });

  it("imports only the new rows of an overlapping later statement", async () => {
    const first = await analyse(AUG_OCT);
    const later = [
      "Date,Description,Amount",
      "08/10/2026,NETFLIX.COM,\"-4,400.00\"",
      "16/10/2026,MTN DATA BUNDLE,\"-2,950.00\"",
      "24/10/2026,SALARY ACME LTD,\"450,000.00\"",
      "28/10/2026,CHICKEN REPUBLIC,\"-2,000.00\"",
      "01/11/2026,DSTV SUBSCRIPTION,\"-15,700.00\"",
      "03/11/2026,UBER TRIP,\"-1,850.00\"",
    ].join("\n");
    const next = await analyse(later);
    expect(next.fileKey).not.toBe(first.fileKey);
    const { fresh, already } = splitByPresence(next.rows, new Set(first.rows.map((r) => r.key)));
    expect(fresh.map((r) => r.payee)).toEqual(["DSTV SUBSCRIPTION", "UBER TRIP"]);
    expect(already).toHaveLength(4);
  });
});

describe("Phase 3 exit: recurrence detection from 3 months imported (FR-MONEY-11)", () => {
  it("suggests the obvious monthly charges and nothing else", async () => {
    const txns = asTxns(await analyse(AUG_OCT));
    const found = detectRecurring(txns, [], TODAY);
    // Latest charge first: MTN (16 Oct), Netflix (8 Oct), DSTV (1 Oct). Shoprite (2), Chicken Republic (irregular),
    // Uber and Jumia (once) and salary (money in) are not subscriptions.
    expect(found.map((s) => [recurringPayee(s.name), s.amountMinor, s.cycle, s.intervalCount, s.lastOn, s.hits])).toEqual([
      ["mtn data bundle", 295_000, "month", 1, "2026-10-16", 3],
      ["netflix.com", 440_000, "month", 1, "2026-10-08", 3],
      ["dstv subscription", 1_570_000, "month", 1, "2026-10-01", 3],
    ]);
  });

  it("stops suggesting one already made into a subscription", async () => {
    const txns = asTxns(await analyse(AUG_OCT));
    const netflix: Subscription = { ...blankSubscription(TODAY, "NGN"), id: "s1", createdAt: 0, name: "Netflix.com", amountMinor: 440_000, anchorOn: "2026-10-08" };
    expect(detectRecurring(txns, [netflix], TODAY).map((s) => recurringPayee(s.name))).toEqual(["mtn data bundle", "dstv subscription"]);
  });
});

describe("Phase 3 exit: a subscription due in 3 days ⇒ notification and island (V31)", () => {
  const sub: Subscription = {
    ...blankSubscription(TODAY, "NGN"),
    id: "sub-netflix",
    createdAt: 0,
    name: "Netflix",
    amountMinor: 440_000,
    anchorOn: "2026-10-08",
    remindDays: 3,
  };
  const raised = (today: string): Notice[] =>
    dueAlerts([sub], today)
      .map(alertNotice)
      .map((n, i) => ({ ...n, id: `n${String(i)}`, createdAt: 0, readAt: null }));

  it("raises one renewal notice, and the island shows it as due in 3 days", () => {
    const notices = raised(TODAY);
    expect(notices.map((n) => [n.dedupeKey, n.title])).toEqual([[alertKey(sub.id, "2026-11-08", "renew"), "Netflix renews Sun 8 Nov"]]);
    // No amount in the text (V25: privacy mode cannot mask a notice).
    expect(`${notices[0]?.title ?? ""} ${notices[0]?.body ?? ""}`).not.toMatch(/4,?400|₦/);
    const island = moneyAlertsFrom(notices, { subscriptions: [sub] }, TODAY);
    expect(island.map((a) => (a.type === "sub" ? [a.kind, a.on, a.sub?.name] : null))).toEqual([["renew", "2026-11-08", "Netflix"]]);
    expect(dueLabel("2026-11-08", TODAY)).toBe("In 3 days");
    expect(shortDue("2026-11-08", TODAY)).toBe("3d");
    // Before the money cache loads, the island still shows it, named from the notice.
    expect(moneyAlertsFrom(notices, {}, TODAY)).toHaveLength(1);
  });

  it("is not raised 4 days out, and leaves the island once read, paused or past", () => {
    expect(raised("2026-11-04")).toEqual([]);
    const notices = raised(TODAY);
    const read = notices.map((n) => ({ ...n, readAt: 1 }));
    expect(moneyAlertsFrom(read, { subscriptions: [sub] }, TODAY)).toEqual([]);
    expect(moneyAlertsFrom(notices, { subscriptions: [{ ...sub, status: "paused" }] }, TODAY)).toEqual([]);
    expect(moneyAlertsFrom(notices, { subscriptions: [] }, TODAY)).toEqual([]);
    expect(moneyAlertsFrom(notices, { subscriptions: [sub] }, "2026-11-09")).toEqual([]);
  });
});

describe("Phase 3 exit: month totals = a hand count (V25, V26)", () => {
  const cat = (id: string, kind: Category["kind"], parentId: string | null = null): Category => ({
    id,
    slug: null,
    name: id,
    parentId,
    emoji: "",
    color: "blue",
    kind,
    archived: false,
  });
  const CATS = byId([cat("food", "expense"), cat("eat-out", "expense", "food"), cat("rides", "expense"), cat("salary", "income"), cat("move", "transfer")]);
  let n = 0;
  const t = (postedOn: string, amountMinor: number, extra: Partial<Txn> = {}): Txn => ({
    id: `t${String(++n)}`,
    accountId: "cash",
    postedOn,
    amountMinor,
    currency: "NGN",
    payee: "",
    categoryId: null,
    note: "",
    tags: [],
    source: "manual",
    transferId: null,
    createdAt: n,
    ...extra,
  });
  const NOVEMBER = [
    t("2026-10-31", -999_900, { categoryId: "food" }), // October: out
    t("2026-11-01", 45_000_000, { categoryId: "salary" }), // + ₦450,000.00
    t("2026-11-02", -1_250_050, { categoryId: "food" }), // − ₦12,500.50
    t("2026-11-03", -800_000, { categoryId: "eat-out" }), // − ₦8,000.00 (child of food)
    t("2026-11-05", -345_000, { categoryId: "rides" }), // − ₦3,450.00
    t("2026-11-07", -10_000_000, { categoryId: "move" }), // transfer category: neither side
    t("2026-11-07", -5_000_000, { transferId: "tr-1" }), // transfer pair: neither side
    t("2026-11-10", -200_025), // − ₦2,000.25, uncategorised out = spend
    t("2026-11-12", 500_000), // + ₦5,000.00, uncategorised in = income
    t("2026-11-15", -1_549, { currency: "USD", categoryId: "rides" }), // − $15.49
    t("2026-11-20", -451, { currency: "USD", categoryId: "food" }), // − $4.51
    t("2026-11-30", -100_000, { categoryId: "food" }), // − ₦1,000.00, last day counts
    t("2026-12-01", -777_700, { categoryId: "food" }), // December: out
  ];

  it("per currency: ₦26,950.75 + $20.00 spent, ₦455,000.00 received, 9 entries", () => {
    const got = totals(NOVEMBER, CATS, "2026-11-01", "2026-11-30");
    // 12,500.50 + 8,000.00 + 3,450.00 + 2,000.25 + 1,000.00 = 26,950.75; 15.49 + 4.51 = 20.00
    expect(got.spend).toEqual([
      { minor: 2_695_075, currency: "NGN" },
      { minor: 2_000, currency: "USD" },
    ]);
    expect(got.income).toEqual([{ minor: 45_500_000, currency: "NGN" }]);
    expect(got.count).toBe(9);
    expect(got.spendCount).toBe(7);
  });

  it("in naira at each day's rate, rounded once: ₦55,025.60", () => {
    const table = new FxTable([
      { on: "2026-11-14", base: "USD", quote: "NGN", rate: "1346.60127178" },
      { on: "2026-11-19", base: "USD", quote: "NGN", rate: "1600.00000000" },
    ]);
    // $15.49 on the 15th at the 14th's rate = ₦20,858.8536998722; $4.51 on the 20th at the 19th's = ₦7,216.00.
    // 26,950.75 + 20,858.8536998722 + 7,216.00 = 55,025.6036998722 → ₦55,025.60
    const got = convertedTotals(NOVEMBER, CATS, "2026-11-01", "2026-11-30", "NGN", table);
    expect(got.spend.total).toEqual({ minor: 5_502_560, currency: "NGN" });
    expect(got.spend.missing).toEqual([]);
    expect(got.income.total).toEqual({ minor: 45_500_000, currency: "NGN" });
    // No rate on or before the 15th: the dollars stay apart, never guessed (V26).
    const late = convertedTotals(NOVEMBER, CATS, "2026-11-01", "2026-11-30", "NGN", new FxTable([{ on: "2026-11-19", base: "USD", quote: "NGN", rate: "1600.00000000" }]));
    expect(late.spend.total).toEqual({ minor: 2_695_075 + 721_600, currency: "NGN" });
    expect(late.spend.missing).toEqual([{ minor: 1_549, currency: "USD" }]);
  });
});
