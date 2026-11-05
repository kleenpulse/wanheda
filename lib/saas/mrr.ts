import { z } from "zod";
import { roundHalfEven, scale, type Ratio } from "@/lib/money/convert";
import { compareEvents, type BillingEventInput } from "./polar/events";

// The MRR engine (SPEC V35, V36), pure. billing_event snapshots in, mrr_movement
// rows out. Nothing here reads a clock or a database, so a rebuild over the
// same log at the same `asOf` gives the same rows, in the same order.
//
// How a snapshot becomes MRR over time: each subscription snapshot tells the
// story of that subscription as Polar saw it at `modified_at` (paid from the
// trial's end, ending at `ends_at` / `ended_at`). Snapshot i is the truth from
// its own time until the next snapshot of the same subscription; the first one
// also tells the history before it, so a first pull of an old subscription
// still starts its MRR on the day it started. Only changes in that timeline
// become movements, so a webhook copy and a pull copy of one state (two rows)
// count once.

export const MOVEMENT_KINDS = ["new", "expansion", "contraction", "churn", "reactivation"] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

export type EngineEvent = Pick<BillingEventInput, "eventId" | "kind" | "occurredAt" | "objectId" | "payload"> & {
  /** The stored billing_event id the movement points back at. */
  id: string;
};

export interface Movement {
  /** Deterministic: same log ⇒ same key. The store hashes it into the row's uuid. */
  key: string;
  productId: string;
  occurredAt: Date;
  customerRef: string;
  kind: MovementKind;
  deltaMrrMinor: number;
  currency: string;
  billingEventId: string;
}

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)));
const optionalDate = isoDate.nullish().catch(null);

const subscriptionFacts = z.looseObject({
  status: z.string(),
  amount: z.number().int(),
  currency: z.string().min(3).max(3),
  recurring_interval: z.string(),
  recurring_interval_count: z.number().int().positive().nullish().catch(null),
  customer_id: z.string().min(1),
  product_id: z.string().nullish().catch(null),
  created_at: isoDate,
  started_at: optionalDate,
  trial_end: optionalDate,
  ends_at: optionalDate,
  ended_at: optionalDate,
  cancel_at_period_end: z.boolean().nullish().catch(null),
});
type SubscriptionFacts = z.infer<typeof subscriptionFacts>;

/** Months per interval as a fraction, so MRR = amount × den ÷ num. week = 12/52 month, day = 12/365 month (V35). */
const INTERVAL_MONTHS: Record<string, [num: number, den: number]> = {
  month: [1, 1],
  year: [12, 1],
  week: [12, 52],
  day: [12, 365],
};

/**
 * One subscription's MRR in minor units: the recurring amount normalised to a
 * month and rounded half-even once (V26). Null for an interval we don't know.
 * Polar's `amount` is already after the discount (it drops when a repeating
 * discount runs out) and before tax-exclusive tax. Polar's own MRR uses an
 * internal net amount that also strips tax-inclusive VAT; webhooks don't
 * carry it, so parity can differ on tax-inclusive prices (V36 marks it).
 */
export function subscriptionMrr(s: Pick<SubscriptionFacts, "amount" | "recurring_interval" | "recurring_interval_count">): number | null {
  const months = INTERVAL_MONTHS[s.recurring_interval];
  if (!months) return null;
  const count = s.recurring_interval_count ?? 1;
  const r: Ratio = scale(Math.max(0, s.amount), months[1], months[0] * count);
  return roundHalfEven(r);
}

// Statuses that pay now; past_due keeps counting until Polar revokes it (V35).
const PAYING = new Set(["active", "past_due"]);
// Statuses that were once paying and have stopped. A paused one restarts as a reactivation.
const STOPPED = new Set(["canceled", "unpaid", "paused"]);

interface Story {
  /** MRR over time as this snapshot tells it: 0 before `from`, `mrr` in [from, until), 0 after. */
  from: number;
  until: number;
  mrr: number;
  product: string | null;
  customer: string;
  currency: string;
}

const ms = (s: string) => Date.parse(s);

/** A snapshot's view of its subscription, or null when it can't tell (unknown status or interval): the previous view stands. */
function storyOf(f: SubscriptionFacts, at: number): Story | null {
  const mrr = subscriptionMrr(f);
  if (mrr === null) return null;
  const base = { product: f.product_id ?? null, customer: f.customer_id, currency: f.currency.toUpperCase() };
  const started = f.started_at ? ms(f.started_at) : ms(f.created_at);
  // Paid from the trial's end (a trial counts 0, V35).
  const from = f.trial_end ? Math.max(started, ms(f.trial_end)) : started;
  const end = f.ended_at ? ms(f.ended_at) : f.ends_at ? ms(f.ends_at) : null;
  if (f.status === "trialing" || f.status === "incomplete" || f.status === "incomplete_expired") {
    return { ...base, from: 0, until: 0, mrr: 0 };
  }
  // Cancel at period end: still paying until access ends, churn on that day.
  if (PAYING.has(f.status)) return { ...base, from, until: end ?? Number.POSITIVE_INFINITY, mrr };
  // Stopped: it paid from `from` until it ended (or until this snapshot, if Polar gave no end).
  if (STOPPED.has(f.status)) return { ...base, from, until: end ?? at, mrr };
  return null;
}

function valueAt(s: Story, t: number): number {
  return t >= s.from && t < s.until ? s.mrr : 0;
}

interface Delta {
  at: number;
  product: string;
  customer: string;
  currency: string;
  delta: number;
  eventId: string;
  /** Tie-break within one instant: the event's fold order. */
  seq: number;
}

/**
 * Every MRR change of one subscription as signed deltas per (product,
 * customer, currency), up to `asOf`. A move between Polar products is a
 * minus on one and a plus on the other.
 */
function subscriptionDeltas(snaps: readonly EngineEvent[], productMap: ReadonlyMap<string, string>, asOf: number, seqStart: number): Delta[] {
  const out: Delta[] = [];
  let cur: { product: string | null; customer: string; currency: string; mrr: number } | null = null;
  let seq = seqStart;

  const set = (at: number, s: Story, mrr: number, eventId: string) => {
    if (at > asOf) return;
    const product = s.product ? (productMap.get(s.product) ?? null) : null;
    const same = cur && cur.product === product && cur.customer === s.customer && cur.currency === s.currency;
    if (same && cur?.mrr === mrr) return;
    if (cur && cur.product && cur.mrr !== 0) {
      out.push({ at, product: cur.product, customer: cur.customer, currency: cur.currency, delta: -cur.mrr, eventId, seq: seq++ });
    }
    if (product && mrr !== 0) out.push({ at, product, customer: s.customer, currency: s.currency, delta: mrr, eventId, seq: seq++ });
    cur = { product, customer: s.customer, currency: s.currency, mrr };
  };

  const stories = snaps.flatMap((e) => {
    const f = subscriptionFacts.safeParse(e.payload);
    if (!f.success) return [];
    const story = storyOf(f.data, e.occurredAt.getTime());
    return story ? [{ e, story, at: e.occurredAt.getTime() }] : [];
  });

  stories.forEach(({ e, story, at }, i) => {
    const next = stories[i + 1]?.at ?? Number.POSITIVE_INFINITY;
    // The first snapshot also tells the history before it.
    const start = i === 0 ? Number.NEGATIVE_INFINITY : at;
    const points = [start, story.from, story.until]
      .filter((t) => t >= start && t < next && Number.isFinite(t))
      .sort((a, b) => a - b);
    if (i !== 0) points.unshift(at);
    for (const t of new Set(points)) set(t, story, valueAt(story, t), e.id);
  });
  return out;
}

const DAY_MS = 86_400_000;
const dayOf = (t: number) => new Date(Math.floor(t / DAY_MS) * DAY_MS).toISOString().slice(0, 10);

/**
 * mrr_movement rows from one connector's billing_event log (V35). Movements
 * are per customer per product per UTC day: a cancel and a new plan on the
 * same day are one expansion or contraction, not a churn and a new.
 * `productMap`: Polar product id → Wanheda product id; anything unmapped is
 * left out. `asOf`: nothing later than this is emitted (a cancel at period end
 * churns on its end date, once that date has come).
 */
export function movementsFrom(events: readonly EngineEvent[], options: { productMap: ReadonlyMap<string, string>; asOf: Date }): Movement[] {
  const asOf = options.asOf.getTime();
  const bySubscription = new Map<string, EngineEvent[]>();
  for (const e of [...events].sort(compareEvents)) {
    if (e.kind !== "subscription") continue;
    const list = bySubscription.get(e.objectId) ?? [];
    list.push(e);
    bySubscription.set(e.objectId, list);
  }

  const deltas: Delta[] = [];
  for (const id of [...bySubscription.keys()].sort()) {
    deltas.push(...subscriptionDeltas(bySubscription.get(id) ?? [], options.productMap, asOf, deltas.length));
  }

  const byGroup = new Map<string, Delta[]>();
  for (const d of deltas) {
    const key = `${d.product}\u0000${d.customer}\u0000${d.currency}`;
    const list = byGroup.get(key) ?? [];
    list.push(d);
    byGroup.set(key, list);
  }

  const movements: Movement[] = [];
  for (const list of byGroup.values()) {
    list.sort((a, b) => a.at - b.at || a.seq - b.seq);
    let mrr = 0;
    let everPaid = false;
    const byDay = new Map<string, Delta[]>();
    for (const d of list) {
      const day = dayOf(d.at);
      const same = byDay.get(day);
      if (same) same.push(d);
      else byDay.set(day, [d]);
    }
    for (const [day, ds] of byDay) {
      const before = mrr;
      for (const d of ds) mrr += d.delta;
      const last = ds.at(-1);
      if (!last || mrr === before) continue;
      const kind: MovementKind =
        before === 0 ? (everPaid ? "reactivation" : "new") : mrr === 0 ? "churn" : mrr > before ? "expansion" : "contraction";
      if (mrr > 0) everPaid = true;
      movements.push({
        key: `${last.product}:${last.eventId}:${kind}:${day}`,
        productId: last.product,
        occurredAt: new Date(last.at),
        customerRef: last.customer,
        kind,
        deltaMrrMinor: mrr - before,
        currency: last.currency,
        billingEventId: last.eventId,
      });
    }
  }
  return movements.sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
}

type MovementFacts = Pick<Movement, "occurredAt" | "customerRef" | "deltaMrrMinor" | "kind">;

/** MRR at the end of `at` (Σ movements on or before it, V35), and each customer's share. */
export function mrrAt(movements: readonly MovementFacts[], at: Date): { mrr: number; customers: Map<string, number> } {
  const t = at.getTime();
  const customers = new Map<string, number>();
  let mrr = 0;
  for (const m of movements) {
    if (m.occurredAt.getTime() > t) continue;
    mrr += m.deltaMrrMinor;
    customers.set(m.customerRef, (customers.get(m.customerRef) ?? 0) + m.deltaMrrMinor);
  }
  for (const [c, v] of customers) if (v === 0) customers.delete(c);
  return { mrr, customers };
}

export interface Metrics {
  mrr: number;
  arr: number;
  /** Σ movements in the period. */
  netNew: number;
  byKind: Record<MovementKind, number>;
  customers: number;
  /** null when there is no customer (shown `—`, V36). */
  arpa: number | null;
  /** Fractions (0.05 = 5 %), null for a zero denominator. */
  customerChurn: number | null;
  netMrrChurn: number | null;
  ltv: number | null;
}

/**
 * V36 metrics for one product (or several) in one currency over (from, to].
 * Pass movements of a single currency: amounts are never added across currencies.
 */
export function metrics(movements: readonly MovementFacts[], from: Date, to: Date): Metrics {
  const start = mrrAt(movements, from);
  const end = mrrAt(movements, to);
  const byKind: Record<MovementKind, number> = { new: 0, expansion: 0, contraction: 0, churn: 0, reactivation: 0 };
  for (const m of movements) {
    const t = m.occurredAt.getTime();
    if (t <= from.getTime() || t > to.getTime()) continue;
    byKind[m.kind] += m.deltaMrrMinor;
  }
  // Lost = paying at the start, paying nothing at the end, across every movement passed: a
  // customer who drops one product but keeps another isn't lost in an overall view (review, T41).
  const lost = new Set([...start.customers.keys()].filter((c) => !end.customers.has(c)));
  const netNew = end.mrr - start.mrr;
  const customers = end.customers.size;
  const startCustomers = start.customers.size;
  const arpa = customers > 0 ? roundHalfEven(scale(end.mrr, 1, customers)) : null;
  const customerChurn = startCustomers > 0 ? lost.size / startCustomers : null;
  // churn and contraction are negative deltas: lost MRR = −(churn + contraction) − (expansion + reactivation).
  const netLost = -(byKind.churn + byKind.contraction) - (byKind.expansion + byKind.reactivation);
  const netMrrChurn = start.mrr > 0 ? netLost / start.mrr : null;
  // LTV = ARPA ÷ churn rate = (MRR ÷ customers) × (start customers ÷ lost), rounded once.
  const ltv = customers > 0 && lost.size > 0 ? roundHalfEven(scale(end.mrr, startCustomers, customers * lost.size)) : null;
  return { mrr: end.mrr, arr: end.mrr * 12, netNew, byKind, customers, arpa, customerChurn, netMrrChurn, ltv };
}

const orderFacts = z.looseObject({
  status: z.string(),
  currency: z.string().min(3).max(3),
  // After discounts, before tax (Polar's deprecated `amount` is the same figure).
  net_amount: z.number().int().nullish().catch(null),
  amount: z.number().int().nullish().catch(null),
  product_id: z.string().nullish().catch(null),
  created_at: isoDate,
});
const refundFacts = z.looseObject({
  status: z.string(),
  // Before tax.
  amount: z.number().int(),
  currency: z.string().min(3).max(3),
  order_id: z.string().min(1),
  created_at: isoDate,
});

const PAID_ORDER = new Set(["paid", "refunded", "partially_refunded"]);

export interface RevenueLine {
  kind: "order" | "refund";
  objectId: string;
  productId: string;
  currency: string;
  /** > 0 for an order, < 0 for a refund. Never part of MRR (V36). */
  amountMinor: number;
  at: Date;
}

/**
 * Paid orders and succeeded refunds per product, from the latest snapshot of
 * each (V34). A refund that landed before its order is kept and counted once
 * the order arrives: the product comes from the order.
 */
export function revenueFrom(events: readonly EngineEvent[], productMap: ReadonlyMap<string, string>): RevenueLine[] {
  const latest = new Map<string, EngineEvent>();
  for (const e of [...events].sort(compareEvents)) {
    if (e.kind === "order" || e.kind === "refund") latest.set(`${e.kind}:${e.objectId}`, e);
  }
  const orderProduct = new Map<string, string>();
  const lines: RevenueLine[] = [];
  for (const e of latest.values()) {
    if (e.kind !== "order") continue;
    const o = orderFacts.safeParse(e.payload);
    if (!o.success || !o.data.product_id) continue;
    const productId = productMap.get(o.data.product_id);
    if (!productId) continue;
    orderProduct.set(e.objectId, productId);
    const amount = o.data.net_amount ?? o.data.amount;
    if (!PAID_ORDER.has(o.data.status) || amount === null || amount === undefined) continue;
    lines.push({ kind: "order", objectId: e.objectId, productId, currency: o.data.currency.toUpperCase(), amountMinor: amount, at: new Date(o.data.created_at) });
  }
  for (const e of latest.values()) {
    if (e.kind !== "refund") continue;
    const r = refundFacts.safeParse(e.payload);
    if (!r.success || r.data.status !== "succeeded") continue;
    const productId = orderProduct.get(r.data.order_id);
    if (!productId) continue;
    lines.push({ kind: "refund", objectId: e.objectId, productId, currency: r.data.currency.toUpperCase(), amountMinor: -r.data.amount, at: new Date(r.data.created_at) });
  }
  return lines.sort((a, b) => a.at.getTime() - b.at.getTime() || (a.objectId < b.objectId ? -1 : a.objectId > b.objectId ? 1 : 0));
}
