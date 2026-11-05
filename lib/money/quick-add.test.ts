import { describe, expect, it } from "vitest";
import type { Account } from "./money";
import { looksLikeQuickAdd, matchCategory, parseQuickAdd, type QuickAddContext } from "./quick-add";
import { DEMO_ACCOUNTS, demoCategories, demoCategoryId } from "./seed";

const [cash, bank, card] = DEMO_ACCOUNTS as [Account, Account, Account];
const ctx: QuickAddContext = { accounts: DEMO_ACCOUNTS, categories: demoCategories(), defaultAccountId: cash.id, today: "2026-11-05" };
const draft = (input: string, c: QuickAddContext = ctx) => {
  const r = parseQuickAdd(input, c);
  if (!r?.ok) throw new Error(`no draft for ${input}: ${JSON.stringify(r)}`);
  return r.draft;
};

describe("parseQuickAdd", () => {
  it("reads amount, category and payee", () => {
    expect(draft("4500 food jollof")).toEqual({
      amountMinor: -450_000,
      currency: "NGN",
      accountId: cash.id,
      categoryId: demoCategoryId("food"),
      payee: "jollof",
      tags: [],
      postedOn: "2026-11-05",
    });
  });

  it("matches aliases and prefers the more specific child", () => {
    const uber = draft("2.5k uber yesterday");
    expect(uber.categoryId).toBe(demoCategoryId("transport"));
    expect(uber.payee).toBe("uber");
    expect(draft("4500 food").payee).toBe("");
    expect(draft("20000 fuel").payee).toBe("");
    expect(draft("3000 data mtn").payee).toBe("mtn");
    expect(uber.postedOn).toBe("2026-11-04");
    expect(uber.amountMinor).toBe(-250_000);
    expect(draft("3000 data mtn").categoryId).toBe(demoCategoryId("airtime"));
    expect(draft("20000 fuel").categoryId).toBe(demoCategoryId("fuel"));
  });

  it("takes income from + or from an income category", () => {
    expect(draft("+50000 salary").amountMinor).toBe(5_000_000);
    expect(draft("50000 salary").amountMinor).toBe(5_000_000);
    expect(draft("+2000 refund").categoryId).toBe(demoCategoryId("refund"));
    expect(draft("+2000").categoryId).toBeNull();
    expect(draft("+2000").amountMinor).toBe(200_000);
    expect(draft("-50000 salary").amountMinor).toBe(-5_000_000);
  });

  it("leaves unknown words as payee and keeps their case", () => {
    const d = draft("1200 Mama Put Ikeja");
    expect(d.categoryId).toBeNull();
    expect(d.payee).toBe("Mama Put Ikeja");
  });

  it("picks the account by @name or by currency symbol", () => {
    expect(draft("4500 food @bank").accountId).toBe(bank.id);
    const netflix = draft("$12 subs netflix");
    expect(netflix.accountId).toBe(card.id);
    expect(netflix.amountMinor).toBe(-1200);
    expect(netflix.currency).toBe("USD");
    expect(netflix.payee).toBe("netflix");
    expect(draft("12 subs netflix @dollar").currency).toBe("USD");
  });

  it("collects tags", () => {
    expect(draft("4500 food #work #Work #trip").tags).toEqual(["work", "trip"]);
  });

  it("refuses what it cannot place", () => {
    expect(parseQuickAdd("food 4500", ctx)).toBeNull();
    expect(parseQuickAdd("note buy SSD", ctx)).toBeNull();
    expect(parseQuickAdd("£12 lunch", ctx)).toEqual({ ok: false, reason: "no-account", currency: "GBP" });
    expect(parseQuickAdd("$12 lunch @cash", ctx)).toEqual({ ok: false, reason: "no-account", currency: "USD" });
    expect(parseQuickAdd("0 food", ctx)).toEqual({ ok: false, reason: "bad-amount" });
    expect(parseQuickAdd("4500.555 food", ctx)).toEqual({ ok: false, reason: "bad-amount" });
    expect(parseQuickAdd("4500 food", { ...ctx, accounts: [] })).toEqual({ ok: false, reason: "no-account" });
  });

  it("skips archived accounts and categories", () => {
    const archived = { ...ctx, accounts: DEMO_ACCOUNTS.map((a) => (a.id === bank.id ? { ...a, archived: true } : a)) };
    expect(draft("4500 food @bank", archived).accountId).toBe(cash.id);
    const cats = demoCategories().map((c) => (c.slug === "food" ? { ...c, archived: true } : c));
    expect(matchCategory(cats, "food", null)).toBeNull();
  });

  it("knows a quick-add when it sees one", () => {
    for (const yes of ["4500 food", "+50k", "$12", "₦4,500 lunch", "-200"]) expect(looksLikeQuickAdd(yes)).toBe(true);
    for (const no of ["note buy SSD", "open notes", "food 4500", ""]) expect(looksLikeQuickAdd(no)).toBe(false);
  });
});
