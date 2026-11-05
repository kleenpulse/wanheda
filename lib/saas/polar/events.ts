import { z } from "zod";

// Polar objects (snake_case on the wire) → billing_event rows (SPEC V34).
// Schemas check only what we key on and stay loose about the rest: an enum
// value Polar adds tomorrow must not sink a webhook. The whole object is kept
// as the payload, so the MRR engine (T41) can read fields nobody needs yet
// and a fix can replay history.

export type BillingKind = "subscription" | "order" | "refund";

export interface BillingEventInput {
  /** Webhook delivery id, or `sync:<kind>:<id>:<modified>` for a pull. */
  eventId: string;
  kind: BillingKind;
  /** When Polar says the object last changed: the order of truth. */
  occurredAt: Date;
  objectId: string;
  providerProductId: string | null;
  customerRef: string | null;
  subscriptionRef: string | null;
  orderRef: string | null;
  payload: Record<string, unknown>;
}

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "not a date");
const ref = z.string().min(1).max(200);

const base = {
  id: ref,
  created_at: isoDate,
  modified_at: isoDate.nullish(),
};

export const polarSubscription = z.looseObject({
  ...base,
  status: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  recurring_interval: z.string(),
  recurring_interval_count: z.number().int().positive().nullish(),
  customer_id: ref,
  product_id: ref.nullish(),
});

export const polarOrder = z.looseObject({
  ...base,
  status: z.string(),
  currency: z.string(),
  customer_id: ref,
  product_id: ref.nullish(),
  subscription_id: ref.nullish(),
});

export const polarRefund = z.looseObject({
  ...base,
  status: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  order_id: ref,
  customer_id: ref.nullish(),
  subscription_id: ref.nullish(),
});

const SCHEMAS = { subscription: polarSubscription, order: polarOrder, refund: polarRefund } as const;

/** The billing kind behind a webhook type, or null for events we don't keep (checkouts, benefits, customers …). */
export function kindOfWebhook(type: string): BillingKind | null {
  const [object] = type.split(".", 1);
  return object === "subscription" || object === "order" || object === "refund" ? object : null;
}

function changedAt(o: { created_at: string; modified_at?: string | null | undefined }): Date {
  return new Date(o.modified_at ?? o.created_at);
}

/** One Polar object as a billing_event row, or null if it isn't the shape we need. */
export function toBillingEvent(kind: BillingKind, data: unknown, eventId: string): BillingEventInput | null {
  const row = (o: { id: string; created_at: string; modified_at?: string | null | undefined }, refs: Pick<BillingEventInput, "providerProductId" | "customerRef" | "subscriptionRef" | "orderRef">): BillingEventInput => ({
    eventId,
    kind,
    occurredAt: changedAt(o),
    objectId: o.id,
    ...refs,
    payload: o,
  });
  switch (kind) {
    case "subscription": {
      const p = polarSubscription.safeParse(data);
      if (!p.success) return null;
      return row(p.data, { providerProductId: p.data.product_id ?? null, customerRef: p.data.customer_id, subscriptionRef: p.data.id, orderRef: null });
    }
    case "order": {
      const p = polarOrder.safeParse(data);
      if (!p.success) return null;
      return row(p.data, { providerProductId: p.data.product_id ?? null, customerRef: p.data.customer_id, subscriptionRef: p.data.subscription_id ?? null, orderRef: p.data.id });
    }
    case "refund": {
      const p = polarRefund.safeParse(data);
      if (!p.success) return null;
      return row(p.data, { providerProductId: null, customerRef: p.data.customer_id ?? null, subscriptionRef: p.data.subscription_id ?? null, orderRef: p.data.order_id });
    }
  }
}

/** A webhook body (`{type, data}`) as a row, `ignored` for a type we don't keep, or null if it's malformed. */
export function fromWebhook(event: unknown, deliveryId: string): BillingEventInput | "ignored" | null {
  const parsed = z.looseObject({ type: z.string(), data: z.unknown() }).safeParse(event);
  if (!parsed.success) return null;
  const kind = kindOfWebhook(parsed.data.type);
  if (!kind) return "ignored";
  return toBillingEvent(kind, parsed.data.data, deliveryId);
}

/** A pulled object as a row. Its id names the snapshot, so pulling the same state again adds nothing. */
export function fromPull(kind: BillingKind, data: unknown): BillingEventInput | null {
  const parsed = SCHEMAS[kind].safeParse(data);
  if (!parsed.success) return null;
  return toBillingEvent(kind, data, `sync:${kind}:${parsed.data.id}:${changedAt(parsed.data).toISOString()}`);
}

/** The ordering every fold uses: provider change time, then event id, so it never depends on arrival. */
export function compareEvents(a: Pick<BillingEventInput, "occurredAt" | "eventId">, b: Pick<BillingEventInput, "occurredAt" | "eventId">): number {
  const byTime = a.occurredAt.getTime() - b.occurredAt.getTime();
  if (byTime !== 0) return byTime;
  return a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0;
}

/**
 * The latest snapshot of each object of one kind (SPEC V34): an older snapshot
 * that lands after a newer one never wins, and the same snapshot delivered
 * three times counts once.
 */
export function latestSnapshots<E extends Pick<BillingEventInput, "kind" | "objectId" | "occurredAt" | "eventId">>(events: readonly E[], kind: BillingKind): Map<string, E> {
  const latest = new Map<string, E>();
  for (const e of events) {
    if (e.kind !== kind) continue;
    const seen = latest.get(e.objectId);
    if (!seen || compareEvents(seen, e) < 0) latest.set(e.objectId, e);
  }
  return latest;
}
