import { exponentOf, formatMoney, isCurrency } from "@/lib/money/currency";
import type { NewNotice } from "@/lib/notifications/notifications";
import { compareEvents } from "./polar/events";
import { mrrAt, type EngineEvent, type Movement } from "./mrr";

// Income alerts (SPEC V37, FR-INCOME-11), pure. reconcile() raises them after
// every rebuild; the dedupe keys make a webhook replay or a rebuild a no-op.
// Only what happened in the last 48 h alerts, so the first sync of years of
// history stays quiet. Text never carries an amount (V25 privacy), except the
// milestone's own label.

/** Every income notice opens the dashboard (T42). */
export const INCOME_HREF = "/income";

export const ALERT_WINDOW_MS = 48 * 3_600_000;

/** MRR milestones in major units. */
const MILESTONES = [100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000] as const;

/** Minor units per major unit; 100 for a currency Wanheda doesn't know. */
const unitOf = (currency: string) => (isCurrency(currency) ? 10 ** exponentOf(currency) : 100);

function milestoneLabel(major: number, currency: string): string {
  return isCurrency(currency) ? formatMoney({ minor: major * unitOf(currency), currency }, { compact: true }) : `${String(major)} ${currency}`;
}

export interface AlertInput {
  movements: readonly Movement[];
  /** Subscription snapshots, for failed payments. */
  events: readonly EngineEvent[];
  productMap: ReadonlyMap<string, string>;
  productNames: ReadonlyMap<string, string>;
  now: Date;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

export function incomeAlerts(input: AlertInput): NewNotice[] {
  const now = input.now.getTime();
  const since = now - ALERT_WINDOW_MS;
  const recent = (t: number) => t > since && t <= now;
  const name = (productId: string) => input.productNames.get(productId) ?? "a product";
  const out: NewNotice[] = [];

  for (const m of input.movements) {
    if (!recent(m.occurredAt.getTime())) continue;
    if (m.kind === "new") {
      out.push({ kind: "income", title: "New customer", body: name(m.productId), href: INCOME_HREF, dedupeKey: `saas:${m.productId}:new:${m.customerRef}` });
    } else if (m.kind === "churn") {
      out.push({ kind: "income", title: "A customer left", body: name(m.productId), href: INCOME_HREF, dedupeKey: `saas:${m.productId}:churn:${m.customerRef}:${day(m.occurredAt)}` });
    }
  }

  // Failed payments: the start of each past_due run, keyed by when it began.
  const bySubscription = new Map<string, EngineEvent[]>();
  for (const e of [...input.events].sort(compareEvents)) {
    if (e.kind !== "subscription") continue;
    const list = bySubscription.get(e.objectId);
    if (list) list.push(e);
    else bySubscription.set(e.objectId, [e]);
  }
  for (const [subscription, snaps] of bySubscription) {
    let runStart: EngineEvent | null = null;
    for (const e of snaps) {
      const status = typeof e.payload.status === "string" ? e.payload.status : null;
      if (status !== "past_due") {
        runStart = null;
        continue;
      }
      runStart ??= e;
    }
    if (!runStart || !recent(runStart.occurredAt.getTime())) continue;
    const polarProduct = typeof runStart.payload.product_id === "string" ? runStart.payload.product_id : null;
    const productId = polarProduct ? input.productMap.get(polarProduct) : undefined;
    if (!productId) continue;
    out.push({
      kind: "income",
      title: "A payment failed",
      body: name(productId),
      href: INCOME_HREF,
      dedupeKey: `saas:${productId}:failed:${subscription}:${runStart.occurredAt.toISOString()}`,
    });
  }

  // Milestones: MRR crossed upwards in the window, per product and, in one currency, overall.
  const groups = new Map<string, Movement[]>();
  for (const m of input.movements) {
    const key = `${m.productId}|${m.currency}`;
    const list = groups.get(key);
    if (list) list.push(m);
    else groups.set(key, [m]);
  }
  const currencies = new Set(input.movements.map((m) => m.currency));
  if (currencies.size === 1) groups.set(`all|${[...currencies][0] ?? ""}`, [...input.movements]);
  for (const [key, list] of groups) {
    const [scope = "", currency = ""] = key.split("|");
    const unit = unitOf(currency);
    const before = mrrAt(list, new Date(since)).mrr;
    const after = mrrAt(list, input.now).mrr;
    for (const major of MILESTONES) {
      const minor = major * unit;
      if (before >= minor || after < minor) continue;
      const label = milestoneLabel(major, currency);
      const who = scope === "all" ? "Your products" : name(scope);
      out.push({ kind: "income", title: `${label} MRR`, body: `${who} passed ${label} MRR`, href: INCOME_HREF, dedupeKey: `saas:${scope}:mrr:${currency}${major}` });
    }
  }
  return out;
}
