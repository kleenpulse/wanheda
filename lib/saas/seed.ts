import type { Product } from "./connectors";
import { movementsFrom, type EngineEvent, type Movement } from "./mrr";

// Demo mode's income (G4): about eight months of Polar-shaped billing events
// for two products, run through the same engine as real data. Never saved.
// Built from a fixed PRNG seeded by the day, so the same day shows the same
// story: sign-ups, trials, upgrades, a failed payment, cancels at period end.

export const DEMO_PRODUCTS: readonly Product[] = [
  { id: "00000000-0000-4000-8000-00000000a001", name: "Motion Garden", url: "https://shadow-garden.example", color: "violet" },
  { id: "00000000-0000-4000-8000-00000000a002", name: "rawstash", url: "https://rawstash.example", color: "aqua" },
];

const [MOTION, RAW] = DEMO_PRODUCTS.map((p) => p.id) as [string, string];

interface Plan {
  polarId: string;
  amount: number;
  interval: "month" | "year";
}

const PLANS: Record<string, readonly Plan[]> = {
  [MOTION]: [
    { polarId: "demo_mg_pro", amount: 900, interval: "month" },
    { polarId: "demo_mg_team", amount: 2900, interval: "month" },
    { polarId: "demo_mg_pro_year", amount: 9000, interval: "year" },
  ],
  [RAW]: [
    { polarId: "demo_raw_plus", amount: 500, interval: "month" },
    { polarId: "demo_raw_plus_year", amount: 4800, interval: "year" },
  ],
};

/** Polar product id → demo product id. */
export const DEMO_PRODUCT_MAP: ReadonlyMap<string, string> = new Map(
  Object.entries(PLANS).flatMap(([productId, plans]) => plans.map((p) => [p.polarId, productId] as const)),
);

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

const DAY_MS = 86_400_000;
const HISTORY_DAYS = 240;
const iso = (t: number) => new Date(t).toISOString();

/** The demo log as of `today`: subscription snapshots plus an order per paid cycle and a couple of refunds. */
export function demoBillingEvents(today: Date): EngineEvent[] {
  const end = Math.floor(today.getTime() / DAY_MS) * DAY_MS + 12 * 3_600_000;
  const rand = prng(Math.floor(end / DAY_MS));
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rand() * list.length)] as T;
  const events: EngineEvent[] = [];
  let n = 0;
  const push = (kind: EngineEvent["kind"], objectId: string, at: number, payload: Record<string, unknown>) => {
    if (at > end) return;
    const eventId = `demo:${kind}:${objectId}:${String(++n)}`;
    events.push({ id: eventId, eventId, kind, occurredAt: new Date(at), objectId, payload: { id: objectId, modified_at: iso(at), ...payload } });
  };

  let customer = 0;
  for (const productId of [MOTION, RAW]) {
    const plans = PLANS[productId] ?? [];
    // Sign-ups get more frequent over time: a product finding its feet.
    for (let day = HISTORY_DAYS; day > 0; day -= 2 + Math.floor(rand() * (day > 120 ? 9 : 5))) {
      const sub = `demo_sub_${String(++customer)}`;
      const cus = `demo_cus_${String(customer)}`;
      const started = end - day * DAY_MS + Math.floor(rand() * 8) * 3_600_000;
      let plan = pick(plans);
      const trialEnd = rand() < 0.3 ? started + 14 * DAY_MS : null;
      const base = (at: number, over: Record<string, unknown> = {}) => ({
        created_at: iso(started),
        started_at: iso(started),
        status: "active",
        amount: plan.amount,
        currency: "usd",
        recurring_interval: plan.interval,
        recurring_interval_count: 1,
        customer_id: cus,
        product_id: plan.polarId,
        cancel_at_period_end: false,
        trial_end: trialEnd ? iso(trialEnd) : null,
        ends_at: null,
        ended_at: null,
        modified_at: iso(at),
        ...over,
      });

      if (trialEnd) {
        push("subscription", sub, started, base(started, { status: "trialing" }));
        if (rand() < 0.25) {
          // Never converted.
          push("subscription", sub, trialEnd, base(trialEnd, { status: "canceled", ended_at: iso(trialEnd), ends_at: iso(trialEnd) }));
          continue;
        }
        push("subscription", sub, trialEnd, base(trialEnd));
      } else {
        push("subscription", sub, started, base(started));
      }

      const paidFrom = trialEnd ?? started;
      const cycle = plan.interval === "month" ? 30 * DAY_MS : 365 * DAY_MS;
      const fate = rand();
      let stoppedAt = Number.POSITIVE_INFINITY;
      if (fate < 0.18) {
        // Upgrade (or switch to yearly) partway.
        const at = paidFrom + Math.floor(rand() * 60 + 20) * DAY_MS;
        const next = plans.find((p) => p.amount > plan.amount && p.interval === plan.interval) ?? plans.find((p) => p !== plan);
        if (next) {
          plan = next;
          push("subscription", sub, at, base(at));
        }
      } else if (fate < 0.36) {
        // Cancel at period end: still paying until access ends.
        const cycles = 1 + Math.floor(rand() * 3);
        const endsAt = paidFrom + cycles * cycle;
        const at = endsAt - Math.floor(rand() * 10 + 2) * DAY_MS;
        push("subscription", sub, at, base(at, { cancel_at_period_end: true, ends_at: iso(endsAt) }));
        push("subscription", sub, endsAt, base(endsAt, { status: "canceled", cancel_at_period_end: true, ends_at: iso(endsAt), ended_at: iso(endsAt) }));
        stoppedAt = endsAt;
      } else if (fate < 0.42) {
        // A failed renewal: past_due, then revoked a week later.
        const dueAt = paidFrom + (1 + Math.floor(rand() * 3)) * cycle;
        push("subscription", sub, dueAt, base(dueAt, { status: "past_due" }));
        push("subscription", sub, dueAt + 7 * DAY_MS, base(dueAt + 7 * DAY_MS, { status: "canceled", ends_at: iso(dueAt + 7 * DAY_MS), ended_at: iso(dueAt + 7 * DAY_MS) }));
        stoppedAt = dueAt;
      }

      // An order per paid cycle; now and then a refund of the first one.
      for (let at = paidFrom, i = 0; at < Math.min(end, stoppedAt); at += cycle, i++) {
        const order = `demo_ord_${String(customer)}_${String(i)}`;
        push("order", order, at, { created_at: iso(at), status: "paid", currency: "usd", net_amount: plan.amount, customer_id: cus, product_id: plan.polarId, subscription_id: sub });
        if (i === 0 && rand() < 0.05) {
          const ref = `demo_ref_${String(customer)}`;
          push("refund", ref, at + 3 * DAY_MS, { created_at: iso(at + 3 * DAY_MS), status: "succeeded", amount: plan.amount, currency: "usd", order_id: order, customer_id: cus });
        }
      }
    }
  }
  return events;
}

/** Demo mrr_movement rows, from the same engine real data goes through. */
export function demoMovements(today: Date): Movement[] {
  return movementsFrom(demoBillingEvents(today), { productMap: DEMO_PRODUCT_MAP, asOf: today });
}
