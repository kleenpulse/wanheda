import { z } from "zod";
import type { NewNotice } from "@/lib/notifications/notifications";
import { addRatio, compareRatio, roundHalfEven, scale, ZERO, type Ratio } from "./convert";
import { CURRENCY_CODES, type Currency, type Money } from "./currency";
import { addDays, addMonths, addMonthsClamped, daysBetween, daysInMonth, isDay, monthsBetween, shortDayLabel, type Day } from "./dates";

// Subscriptions (FR-MONEY-8, 9; SPEC T36). Pure: shared by the store, the
// actions, the client and the alert check. A subscription stores one known
// renewal day (`anchorOn`); every renewal is counted from it, never chained
// from the last one, so a 31st clamps to each month's end without drifting
// (V30). The next renewal is worked out from today, never stored.

export const SUB_CYCLES = ["day", "week", "month", "year"] as const;
export type SubCycle = (typeof SUB_CYCLES)[number];

export const SUB_STATUSES = ["active", "paused", "cancelled"] as const;
export type SubStatus = (typeof SUB_STATUSES)[number];

export const SUB_NAME_MAX = 80;
export const SUB_URL_MAX = 500;
export const SUB_INTERVAL_MAX = 366;
export const SUB_REMIND_MAX = 60;
export const SUB_REMIND_DEFAULT = 3;

export interface Subscription {
  id: string;
  name: string;
  /** The charge, as a positive amount (the DB checks > 0). */
  amountMinor: number;
  currency: Currency;
  cycle: SubCycle;
  /** Every `intervalCount` cycles: 2 + month = every 2 months. */
  intervalCount: number;
  /** One known renewal day; all others are counted from it (V30). */
  anchorOn: Day;
  trialEndsOn: Day | null;
  /** Remind this many days before a renewal or trial end (0 = on the day). */
  remindDays: number;
  accountId: string | null;
  categoryId: string | null;
  status: SubStatus;
  cancelUrl: string | null;
  /** Made from a detected pattern of txns (T37). Set by the server only. */
  detectedFromTxn: boolean;
  createdAt: number;
  /** On a new one made from a suggestion: the charge it was detected from, for the server to check (never stored). */
  fromTxn?: string;
}

export function isSubCycle(v: unknown): v is SubCycle {
  return typeof v === "string" && (SUB_CYCLES as readonly string[]).includes(v);
}

export function isSubStatus(v: unknown): v is SubStatus {
  return typeof v === "string" && (SUB_STATUSES as readonly string[]).includes(v);
}

/** An http(s) link, nothing else: the page renders it as a link. */
export function isWebUrl(text: string): boolean {
  try {
    const u = new URL(text);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

const day = z.string().refine(isDay, "Not a calendar day");

/**
 * One subscription write from the client. No owner and no `detectedFromTxn`:
 * the server sets both (V7, V28). `fromTxn` names the charge a suggestion was
 * made from; the server marks the subscription detected only when that txn is
 * the owner's, and only when it creates it.
 */
export const subscriptionWriteSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(SUB_NAME_MAX),
    amountMinor: z.number().refine((n) => Number.isSafeInteger(n) && n > 0, "Amount must be a positive whole number of minor units"),
    currency: z.enum(CURRENCY_CODES as [Currency, ...Currency[]]),
    cycle: z.enum(SUB_CYCLES),
    intervalCount: z.number().int().min(1).max(SUB_INTERVAL_MAX),
    anchorOn: day,
    trialEndsOn: day.nullable(),
    remindDays: z.number().int().min(0).max(SUB_REMIND_MAX),
    accountId: z.uuid().nullable(),
    categoryId: z.uuid().nullable(),
    status: z.enum(SUB_STATUSES),
    cancelUrl: z.string().trim().max(SUB_URL_MAX).refine(isWebUrl, "Not a web link").nullable(),
    fromTxn: z.uuid().optional(),
  })
  .strict();

export type SubscriptionWrite = z.infer<typeof subscriptionWriteSchema>;

export function subscriptionWriteOf(s: Subscription): SubscriptionWrite {
  return {
    id: s.id,
    name: s.name,
    amountMinor: s.amountMinor,
    currency: s.currency,
    cycle: s.cycle,
    intervalCount: s.intervalCount,
    anchorOn: s.anchorOn,
    trialEndsOn: s.trialEndsOn,
    remindDays: s.remindDays,
    accountId: s.accountId,
    categoryId: s.categoryId,
    status: s.status,
    cancelUrl: s.cancelUrl,
    ...(s.fromTxn ? { fromTxn: s.fromTxn } : {}),
  };
}

type Schedule = Pick<Subscription, "cycle" | "intervalCount" | "anchorOn">;

/** Renewal k (k ≥ 0), counted from the anchor (V30). */
export function occurrence(s: Schedule, k: number): Day {
  const step = k * s.intervalCount;
  switch (s.cycle) {
    case "day":
      return addDays(s.anchorOn, step);
    case "week":
      return addDays(s.anchorOn, 7 * step);
    case "month":
      return addMonthsClamped(s.anchorOn, step);
    case "year":
      return addMonthsClamped(s.anchorOn, 12 * step);
  }
}

/** The index of the first renewal on or after `from` (0 when the anchor is still ahead). */
function firstIndexFrom(s: Schedule, from: Day): number {
  if (from <= s.anchorOn) return 0;
  let k: number;
  if (s.cycle === "day" || s.cycle === "week") {
    const stepDays = s.intervalCount * (s.cycle === "week" ? 7 : 1);
    k = Math.ceil(daysBetween(s.anchorOn, from) / stepDays);
  } else {
    const stepMonths = s.intervalCount * (s.cycle === "year" ? 12 : 1);
    k = Math.max(0, Math.floor(monthsBetween(s.anchorOn, from) / stepMonths));
  }
  // The estimate is at most one short (a clamped month end); step up to it.
  while (occurrence(s, k) < from) k++;
  return k;
}

/** The first renewal on or after `from`, whatever the status. */
export function nextOn(s: Schedule, from: Day): Day {
  return occurrence(s, firstIndexFrom(s, from));
}

/**
 * The anchor an edit stores (V30). The form shows the next renewal, not the
 * anchor. A changed date becomes the anchor; an untouched one keeps the stored
 * anchor while the schedule is the same. When only the cycle or count changed,
 * the shown day stays the next renewal, but a month end shown clamped (a 31st
 * as Feb 28) would turn into a 28th for good. So it anchors on an earlier
 * renewal of the new schedule that still holds the old day of the month, as
 * long as the next renewal from today stays the shown one.
 */
export function editedAnchor(
  initial: Schedule,
  edited: Pick<Schedule, "cycle" | "intervalCount">,
  shownNext: Day,
  renewOn: Day,
  today: Day,
): Day {
  if (renewOn !== shownNext) return renewOn;
  if (edited.cycle === initial.cycle && edited.intervalCount === initial.intervalCount) return initial.anchorOn;
  const monthly = (c: SubCycle) => c === "month" || c === "year";
  if (!monthly(initial.cycle) || !monthly(edited.cycle)) return shownNext;
  const want = Number(initial.anchorOn.slice(8));
  const step = edited.intervalCount * (edited.cycle === "year" ? 12 : 1);
  let best = shownNext;
  // Four steps back reach a month long enough, or a leap year for Feb 29.
  for (let j = 1; j <= 4 && Number(best.slice(8)) < want; j++) {
    const month = addMonths(shownNext, -j * step);
    const dim = daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)));
    const candidate: Day = `${month.slice(0, 8)}${String(Math.min(want, dim)).padStart(2, "0")}`;
    if (candidate.slice(8) > best.slice(8) && nextOn({ ...edited, anchorOn: candidate }, today) === shownNext) best = candidate;
  }
  return best;
}

/** The next renewal from today, or null when paused or cancelled (V30). */
export function nextRenewal(s: Subscription, today: Day): Day | null {
  return s.status === "active" ? nextOn(s, today) : null;
}

/** Most renewals one range lists: a daily subscription over a long range stays bounded. */
const RANGE_CAP = 400;

/** Every renewal in [from, to] of an active subscription. */
export function renewalsBetween(s: Subscription, from: Day, to: Day): Day[] {
  if (s.status !== "active") return [];
  const out: Day[] = [];
  for (let k = firstIndexFrom(s, from); out.length < RANGE_CAP; k++) {
    const on = occurrence(s, k);
    if (on > to) break;
    out.push(on);
  }
  return out;
}

/**
 * The renewal days that bound every cycle across [from, to]: the last one on
 * or before `from`, each one inside, and the first one after `to`. Before the
 * first renewal, the cycle ending on it is implied (counted back from the
 * anchor), so progress through a cycle is defined on every day.
 */
export function renewalsAround(s: Schedule, from: Day, to: Day): Day[] {
  const out: Day[] = [];
  for (let k = firstIndexFrom(s, addDays(from, 1)) - 1; out.length < RANGE_CAP; k++) {
    const on = occurrence(s, k);
    out.push(on);
    if (on > to) break;
  }
  return out;
}

// Cost per month and per year as exact fractions (V26): weekly ×52/12,
// yearly /12, every N days ×365/12/N, every N months /N.
const PER_MONTH: Record<SubCycle, [num: number, den: number]> = { day: [365, 12], week: [52, 12], month: [1, 1], year: [1, 12] };
const PER_YEAR: Record<SubCycle, [num: number, den: number]> = { day: [365, 1], week: [52, 1], month: [12, 1], year: [1, 1] };

export type Per = "month" | "year";

/** What one subscription costs per month or year, exactly. */
export function costRatio(s: Pick<Subscription, "amountMinor" | "cycle" | "intervalCount">, per: Per): Ratio {
  const [num, den] = (per === "month" ? PER_MONTH : PER_YEAR)[s.cycle];
  return scale(s.amountMinor, num, den * s.intervalCount);
}

/** One subscription's cost per month or year, rounded once (V26). */
export function costOf(s: Subscription, per: Per): Money {
  return { minor: roundHalfEven(costRatio(s, per)), currency: s.currency };
}

/**
 * What the active subscriptions cost per month or year, one total per
 * currency (never added across currencies without a rate, V26). Each total
 * is summed exactly and rounded once. `first` leads, then first-seen order.
 */
export function costTotals(subs: readonly Subscription[], per: Per, first?: Currency): Money[] {
  const sums = new Map<Currency, Ratio>();
  for (const s of subs) {
    if (s.status !== "active") continue;
    sums.set(s.currency, addRatio(sums.get(s.currency) ?? ZERO, costRatio(s, per)));
  }
  return [...sums]
    .map(([currency, r]) => ({ minor: roundHalfEven(r), currency }))
    .sort((a, b) => Number(b.currency === first) - Number(a.currency === first));
}

/**
 * "What can I cut" (FR-MONEY-9): active subscriptions by monthly cost, most
 * first. Currencies can't be compared without a rate, so each currency is its
 * own run, `first` (the base currency) leading.
 */
export function byMonthlyCost(subs: readonly Subscription[], first?: Currency): Subscription[] {
  return subs
    .filter((s) => s.status === "active")
    .sort(
      (a, b) =>
        Number(b.currency === first) - Number(a.currency === first) ||
        (a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : 0) ||
        compareRatio(costRatio(b, "month"), costRatio(a, "month")) ||
        a.name.localeCompare(b.name),
    );
}

export type SubEventKind = "renew" | "trial";

export interface SubEvent {
  sub: Subscription;
  on: Day;
  kind: SubEventKind;
}

/** Renewals and trial ends of active subscriptions in [from, to], soonest first (the timeline). */
export function upcoming(subs: readonly Subscription[], from: Day, to: Day): SubEvent[] {
  const events: SubEvent[] = [];
  for (const s of subs) {
    if (s.status !== "active") continue;
    for (const on of renewalsBetween(s, from, to)) events.push({ sub: s, on, kind: "renew" });
    if (s.trialEndsOn && s.trialEndsOn >= from && s.trialEndsOn <= to) events.push({ sub: s, on: s.trialEndsOn, kind: "trial" });
  }
  return events.sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0) || (a.kind === b.kind ? 0 : a.kind === "trial" ? -1 : 1) || a.sub.name.localeCompare(b.sub.name));
}

/** One alert-worthy date (V31): a renewal or a trial end within the reminder window. */
export interface SubAlert {
  /** The notification's dedupe key: `sub:<id>:<on>:renew|trial`. */
  key: string;
  subId: string;
  name: string;
  on: Day;
  kind: SubEventKind;
}

export function alertKey(subId: string, on: Day, kind: SubEventKind): string {
  return `sub:${subId}:${on}:${kind}`;
}

/** Reads a dedupe key back, or null when it isn't a subscription alert. */
export function parseAlertKey(key: string): { subId: string; on: Day; kind: SubEventKind } | null {
  const m = /^sub:([^:]+):(\d{4}-\d{2}-\d{2}):(renew|trial)$/.exec(key);
  if (!m?.[1] || !m[2] || !isDay(m[2])) return null;
  return { subId: m[1], on: m[2], kind: m[3] === "trial" ? "trial" : "renew" };
}

/**
 * What is due a reminder today (V31): an active subscription's next renewal,
 * or its trial end, no more than `remindDays` ahead. The same facts on every
 * device and every check, so the dedupe key raises each one once.
 */
export function dueAlerts(subs: readonly Subscription[], today: Day): SubAlert[] {
  const out: SubAlert[] = [];
  for (const s of subs) {
    if (s.status !== "active") continue;
    const next = nextOn(s, today);
    const trial = s.trialEndsOn;
    // A renewal on or before the trial's end is the trial's own reminder, not a second one.
    const inTrial = trial !== null && next <= trial;
    if (!inTrial && daysBetween(today, next) <= s.remindDays) out.push({ key: alertKey(s.id, next, "renew"), subId: s.id, name: s.name, on: next, kind: "renew" });
    if (trial && trial >= today && daysBetween(today, trial) <= s.remindDays) {
      out.push({ key: alertKey(s.id, trial, "trial"), subId: s.id, name: s.name, on: trial, kind: "trial" });
    }
  }
  return out;
}

/**
 * An alert's notification text. Dates, never "in 3 days" (it goes stale in
 * the centre), and no amount: figures only show through <MoneyText> (V25).
 */
export function alertText(a: Pick<SubAlert, "name" | "on" | "kind">): { title: string; body: string } {
  const when = shortDayLabel(a.on);
  return a.kind === "trial"
    ? { title: `${a.name} trial ends ${when}`, body: "Cancel before then if you don't want to pay for it." }
    : { title: `${a.name} renews ${when}`, body: "Cancel or change it before then if you need to." };
}

/** Where an alert leads: the subscriptions page. */
export const SUBSCRIPTIONS_HREF = "/money/subscriptions";

/** The notification an alert raises, once per key (V31). */
export function alertNotice(a: SubAlert): NewNotice {
  return { kind: "money", ...alertText(a), href: SUBSCRIPTIONS_HREF, dedupeKey: a.key };
}

/** "Today", "Tomorrow", "In 3 days". */
export function dueLabel(on: Day, today: Day): string {
  const n = daysBetween(today, on);
  if (n <= 0) return "Today";
  if (n === 1) return "Tomorrow";
  return `In ${String(n)} days`;
}

/** "Monthly", "Every 2 weeks", "Every 10 days". */
export function cycleLabel(s: Pick<Subscription, "cycle" | "intervalCount">): string {
  const n = s.intervalCount;
  if (n === 1) return { day: "Daily", week: "Weekly", month: "Monthly", year: "Yearly" }[s.cycle];
  return `Every ${String(n)} ${s.cycle}s`;
}

/** A subscription's start for a new one: today's renewal, monthly, reminded 3 days ahead. */
export function blankSubscription(today: Day, currency: Currency): Omit<Subscription, "id" | "createdAt"> {
  return {
    name: "",
    amountMinor: 0,
    currency,
    cycle: "month",
    intervalCount: 1,
    anchorOn: today,
    trialEndsOn: null,
    remindDays: SUB_REMIND_DEFAULT,
    accountId: null,
    categoryId: null,
    status: "active",
    cancelUrl: null,
    detectedFromTxn: false,
  };
}
