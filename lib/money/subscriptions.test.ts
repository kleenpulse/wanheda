import { describe, expect, it } from "vitest";
import { addRatio, compareRatio, roundHalfEven, scale } from "./convert";
import {
  alertKey,
  alertText,
  blankSubscription,
  byMonthlyCost,
  costOf,
  costTotals,
  cycleLabel,
  dueAlerts,
  dueLabel,
  editedAnchor,
  nextOn,
  nextRenewal,
  occurrence,
  parseAlertKey,
  renewalsAround,
  renewalsBetween,
  subscriptionWriteSchema,
  upcoming,
  type Subscription,
} from "./subscriptions";
import type { Day } from "./dates";

let n = 0;
function sub(over: Partial<Subscription> = {}): Subscription {
  n++;
  return {
    ...blankSubscription("2026-01-31", "NGN"),
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    name: `Sub ${String(n)}`,
    amountMinor: 1_000,
    createdAt: n,
    ...over,
  };
}

describe("convert", () => {
  it("rounds half to even, both signs", () => {
    expect(roundHalfEven(scale(5, 1, 2))).toBe(2); // 2.5
    expect(roundHalfEven(scale(7, 1, 2))).toBe(4); // 3.5
    expect(roundHalfEven(scale(-5, 1, 2))).toBe(-2);
    expect(roundHalfEven(scale(-7, 1, 2))).toBe(-4);
    expect(roundHalfEven(scale(10, 1, 3))).toBe(3);
    expect(roundHalfEven(scale(20, 1, 3))).toBe(7);
    expect(Object.is(roundHalfEven(scale(-1, 1, 3)), 0)).toBe(true);
  });

  it("adds and compares exactly", () => {
    const third = scale(1, 1, 3);
    const sum = addRatio(addRatio(third, third), third);
    expect(sum).toEqual({ num: 1n, den: 1n });
    expect(compareRatio(scale(1, 1, 3), scale(1, 1, 4))).toBe(1);
    expect(compareRatio(scale(2, 1, 4), scale(1, 1, 2))).toBe(0);
  });

  it("refuses an unsafe result", () => {
    expect(() => roundHalfEven(scale(Number.MAX_SAFE_INTEGER, 2, 1))).toThrow();
  });
});

describe("schedule (V30)", () => {
  it("clamps a 31st to each month's end without drifting", () => {
    const s = sub({ anchorOn: "2026-01-31" });
    expect([0, 1, 2, 3].map((k) => occurrence(s, k))).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("keeps Feb 29 on leap years and clamps it in between", () => {
    const s = sub({ anchorOn: "2028-02-29", cycle: "year" });
    expect([0, 1, 4].map((k) => occurrence(s, k))).toEqual(["2028-02-29", "2029-02-28", "2032-02-29"]);
  });

  it("steps days, weeks and every-N cycles from the anchor", () => {
    expect(occurrence(sub({ anchorOn: "2026-11-01", cycle: "day", intervalCount: 10 }), 3)).toBe("2026-12-01");
    expect(occurrence(sub({ anchorOn: "2026-11-02", cycle: "week", intervalCount: 2 }), 2)).toBe("2026-11-30");
    expect(occurrence(sub({ anchorOn: "2026-08-31", cycle: "month", intervalCount: 3 }), 2)).toBe("2027-02-28");
  });

  it("finds the next renewal from today", () => {
    const s = sub({ anchorOn: "2026-01-31" });
    expect(nextOn(s, "2026-11-05")).toBe("2026-11-30");
    expect(nextOn(s, "2026-11-30")).toBe("2026-11-30");
    expect(nextOn(s, "2026-12-01")).toBe("2026-12-31");
    expect(nextOn(s, "2025-06-01")).toBe("2026-01-31");
    expect(nextOn(sub({ anchorOn: "2026-11-01", cycle: "day", intervalCount: 10 }), "2026-11-12")).toBe("2026-11-21");
    expect(nextOn(sub({ anchorOn: "2024-03-15", cycle: "year" }), "2026-03-16")).toBe("2027-03-15");
  });

  it("has no renewals while paused or cancelled", () => {
    expect(nextRenewal(sub({ status: "paused" }), "2026-11-05")).toBeNull();
    expect(renewalsBetween(sub({ status: "cancelled" }), "2026-01-01", "2026-12-31")).toEqual([]);
  });

  it("bounds every cycle across a range, implying the one before a first renewal", () => {
    const s = sub({ anchorOn: "2026-01-31" });
    expect(renewalsAround(s, "2026-11-05", "2026-12-05")).toEqual(["2026-10-31", "2026-11-30", "2026-12-31"]);
    // A renewal on `from` itself starts the first cycle.
    expect(renewalsAround(s, "2026-11-30", "2026-11-30")).toEqual(["2026-11-30", "2026-12-31"]);
    // Not started yet: the cycle ending on the anchor is counted back from it.
    expect(renewalsAround(sub({ anchorOn: "2026-11-20" }), "2026-11-05", "2026-11-25")).toEqual(["2026-10-20", "2026-11-20", "2026-12-20"]);
  });

  it("lists every renewal in a range", () => {
    const s = sub({ anchorOn: "2026-10-05", cycle: "week" });
    expect(renewalsBetween(s, "2026-11-01", "2026-11-30")).toEqual(["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30"]);
  });
});

describe("editedAnchor (V30)", () => {
  // Edit a schedule the way the form does: the date field shows nextOn(initial, today).
  function edit(initial: Subscription, edited: Pick<Subscription, "cycle" | "intervalCount">, today: Day, renewOn?: Day) {
    const shownNext = nextOn(initial, today);
    const anchorOn = editedAnchor(initial, edited, shownNext, renewOn ?? shownNext, today);
    return { shownNext, anchorOn, after: { ...initial, ...edited, anchorOn } };
  }

  it("keeps the stored anchor when nothing in the schedule changed", () => {
    const s = sub({ anchorOn: "2026-01-31" });
    expect(edit(s, { cycle: "month", intervalCount: 1 }, "2026-02-05").anchorOn).toBe("2026-01-31");
  });

  it("takes a changed date as the new anchor", () => {
    const s = sub({ anchorOn: "2026-01-31" });
    expect(edit(s, { cycle: "month", intervalCount: 2 }, "2026-02-05", "2026-02-20").anchorOn).toBe("2026-02-20");
  });

  it("keeps a month end when only the count changes in a short month", () => {
    const s = sub({ anchorOn: "2026-01-31" });
    const { shownNext, anchorOn, after } = edit(s, { cycle: "month", intervalCount: 2 }, "2026-02-05");
    expect(shownNext).toBe("2026-02-28");
    expect(anchorOn).toBe("2025-12-31");
    expect(nextOn(after, "2026-02-05")).toBe("2026-02-28");
    expect(renewalsBetween(after, "2026-02-01", "2026-12-31")).toEqual(["2026-02-28", "2026-04-30", "2026-06-30", "2026-08-31", "2026-10-31", "2026-12-31"]);
  });

  it("keeps the day when switching monthly to yearly, Feb 29 reaching back to a leap year", () => {
    const s = sub({ anchorOn: "2026-01-29" });
    const { anchorOn, after } = edit(s, { cycle: "year", intervalCount: 1 }, "2027-02-10");
    expect(anchorOn).toBe("2024-02-29");
    expect(nextOn(after, "2027-02-10")).toBe("2027-02-28");
    expect(occurrence(after, 4)).toBe("2028-02-29");
  });

  it("never moves the shown next renewal, even if the day must clamp", () => {
    // Every 2 months on the 31st, next Feb 28; monthly from Jan 5 would renew on Jan 31 first.
    const s = sub({ anchorOn: "2025-12-31", intervalCount: 2 });
    const { shownNext, anchorOn, after } = edit(s, { cycle: "month", intervalCount: 1 }, "2026-01-05");
    expect(shownNext).toBe("2026-02-28");
    expect(anchorOn).toBe("2026-02-28");
    expect(nextOn(after, "2026-01-05")).toBe("2026-02-28");
  });

  it("uses the shown day when either cycle counts days or weeks", () => {
    const weekly = sub({ anchorOn: "2026-01-31", cycle: "week" });
    expect(edit(weekly, { cycle: "month", intervalCount: 1 }, "2026-02-05").anchorOn).toBe(nextOn(weekly, "2026-02-05"));
    const monthly = sub({ anchorOn: "2026-01-31" });
    expect(edit(monthly, { cycle: "week", intervalCount: 1 }, "2026-02-05").anchorOn).toBe("2026-02-28");
  });
});

describe("cost (V26)", () => {
  it("normalises each cycle exactly and rounds once", () => {
    // ₦1,000 weekly: 100000 × 52 / 12 = 433333.33… → 433333
    expect(costOf(sub({ amountMinor: 100_000, cycle: "week" }), "month").minor).toBe(433_333);
    expect(costOf(sub({ amountMinor: 120_000, cycle: "year" }), "month").minor).toBe(10_000);
    expect(costOf(sub({ amountMinor: 3_000, cycle: "month", intervalCount: 3 }), "month").minor).toBe(1_000);
    // every 10 days: 1200 × 365 / 12 / 10 = 3650
    expect(costOf(sub({ amountMinor: 1_200, cycle: "day", intervalCount: 10 }), "month").minor).toBe(3_650);
    expect(costOf(sub({ amountMinor: 1_549, cycle: "month" }), "year").minor).toBe(18_588);
    expect(costOf(sub({ amountMinor: 100_000, cycle: "week" }), "year").minor).toBe(5_200_000);
  });

  it("sums totals exactly before rounding, one per currency, base first", () => {
    // Three weekly 1-kobo charges: each 4.333… a month, 13 together, not 4 + 4 + 4.
    const tiny = [1, 2, 3].map(() => sub({ amountMinor: 1, cycle: "week" }));
    expect(costTotals(tiny, "month")).toEqual([{ minor: 13, currency: "NGN" }]);
    const mixed = [sub({ currency: "USD", amountMinor: 1_549 }), sub({ amountMinor: 500_000 }), sub({ amountMinor: 1, status: "paused" })];
    expect(costTotals(mixed, "month", "NGN")).toEqual([
      { minor: 500_000, currency: "NGN" },
      { minor: 1_549, currency: "USD" },
    ]);
  });

  it("ranks what to cut by monthly cost within each currency", () => {
    const yearly = sub({ name: "Yearly", amountMinor: 600_000, cycle: "year" }); // 50 000 a month
    const monthly = sub({ name: "Monthly", amountMinor: 60_000 });
    const usd = sub({ name: "Dollar", currency: "USD", amountMinor: 999_999 });
    const paused = sub({ name: "Paused", amountMinor: 9_999_999, status: "paused" });
    expect(byMonthlyCost([yearly, usd, paused, monthly], "NGN").map((s) => s.name)).toEqual(["Monthly", "Yearly", "Dollar"]);
  });
});

describe("timeline and alerts (V31)", () => {
  it("lists renewals and trial ends soonest first", () => {
    const a = sub({ name: "A", anchorOn: "2026-10-10" });
    const b = sub({ name: "B", anchorOn: "2026-11-20", trialEndsOn: "2026-11-08" });
    const off = sub({ name: "Off", anchorOn: "2026-11-07", status: "cancelled" });
    expect(upcoming([a, b, off], "2026-11-05", "2026-12-15").map((e) => `${e.sub.name} ${e.on} ${e.kind}`)).toEqual([
      "B 2026-11-08 trial",
      "A 2026-11-10 renew",
      "B 2026-11-20 renew",
      "A 2026-12-10 renew",
    ]);
  });

  it("raises a renewal within remindDays, and a trial end, keyed by date", () => {
    const due = sub({ anchorOn: "2026-10-08", remindDays: 3 });
    const far = sub({ anchorOn: "2026-10-20", remindDays: 3 });
    const sameDay = sub({ anchorOn: "2026-10-05", remindDays: 0 });
    const trial = sub({ anchorOn: "2026-12-01", trialEndsOn: "2026-11-07", remindDays: 3 });
    const paused = sub({ anchorOn: "2026-10-06", status: "paused" });
    const alerts = dueAlerts([due, far, sameDay, trial, paused], "2026-11-05");
    expect(alerts.map((a) => a.key)).toEqual([
      alertKey(due.id, "2026-11-08", "renew"),
      alertKey(sameDay.id, "2026-11-05", "renew"),
      alertKey(trial.id, "2026-11-07", "trial"),
    ]);
    // Checked again a day later: the same renewal, so the same key (raised once).
    expect(dueAlerts([due], "2026-11-06")[0]?.key).toBe(alertKey(due.id, "2026-11-08", "renew"));
    // A trial end already past raises nothing.
    expect(dueAlerts([trial], "2026-11-08")).toEqual([]);
    // First charge on the trial's last day: one reminder (the trial's), not two.
    const firstCharge = sub({ anchorOn: "2026-11-07", trialEndsOn: "2026-11-07" });
    expect(dueAlerts([firstCharge], "2026-11-05").map((a) => a.kind)).toEqual(["trial"]);
  });

  it("reads its keys back and words alerts with dates, not amounts", () => {
    expect(parseAlertKey("sub:abc:2026-11-08:trial")).toEqual({ subId: "abc", on: "2026-11-08", kind: "trial" });
    expect(parseAlertKey("budget:all:2026-11:80")).toBeNull();
    expect(parseAlertKey("sub:abc:2026-02-30:renew")).toBeNull();
    expect(alertText({ name: "Netflix", on: "2026-11-08", kind: "renew" }).title).toBe("Netflix renews Sun 8 Nov");
    expect(dueLabel("2026-11-05", "2026-11-05")).toBe("Today");
    expect(dueLabel("2026-11-06", "2026-11-05")).toBe("Tomorrow");
    expect(dueLabel("2026-11-08", "2026-11-05")).toBe("In 3 days");
    expect(cycleLabel({ cycle: "month", intervalCount: 1 })).toBe("Monthly");
    expect(cycleLabel({ cycle: "week", intervalCount: 2 })).toBe("Every 2 weeks");
  });
});

describe("subscriptionWriteSchema", () => {
  const ok = {
    id: "0b9e1c4e-6f0a-4c39-9a51-2f8d7c3b1a10",
    name: " Netflix ",
    amountMinor: 1_549,
    currency: "USD",
    cycle: "month",
    intervalCount: 1,
    anchorOn: "2026-11-05",
    trialEndsOn: null,
    remindDays: 3,
    accountId: null,
    categoryId: null,
    status: "active",
    cancelUrl: "https://example.com/cancel",
  };

  it("accepts a good write and trims the name", () => {
    expect(subscriptionWriteSchema.parse(ok).name).toBe("Netflix");
  });

  it.each([
    ["zero amount", { amountMinor: 0 }],
    ["float amount", { amountMinor: 15.49 }],
    ["bad cycle", { cycle: "fortnight" }],
    ["interval 0", { intervalCount: 0 }],
    ["remind 61", { remindDays: 61 }],
    ["bad day", { anchorOn: "2026-02-30" }],
    ["script link", { cancelUrl: "javascript:alert(1)" }],
    ["unknown key", { detectedFromTxn: true }],
  ])("refuses %s", (_, over) => {
    expect(subscriptionWriteSchema.safeParse({ ...ok, ...over }).success).toBe(false);
  });
});
