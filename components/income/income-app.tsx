"use client";

import Link from "next/link";
import * as React from "react";
import { Delta } from "@/components/money/charts/chart-kit";
import { MoneyText } from "@/components/money/money-text";
import { useAccount } from "@/components/shell/account";
import { EmptyState } from "@/components/shell/page-frame";
import { buttonClass } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import type { Currency } from "@/lib/money/currency";
import {
  hasIncome,
  headline,
  inProduct,
  monthOf,
  monthlyRows,
  parity,
  rangeMonths,
  revenueByMonthFor,
  revenueByProduct,
  scopeCurrencies,
  type IncomePayload,
  type IncomeRange,
} from "@/lib/saas/income";
import { MovementBars } from "./charts/movement-bars";
import { RevenueByMonth, RevenueByProduct } from "./charts/revenue";
import { TrendLine } from "./charts/trend-line";
import { Waterfall } from "./charts/waterfall";
import { ParityCard } from "./parity";
import { useCurrencyParam, useFacts, useIncome, useIncomeNow, useProductParam, useRangeParam } from "./use-income";

// The income dashboard (T42, FRD §12.6): MRR and its movements, customers,
// churn, ARPA, LTV, revenue by product, and Polar parity, for every product or
// one. Paints from the income cache at once; the page's Prefetch refreshes it
// (V24). Each view is one currency (V25); figures go through <MoneyText>, so
// privacy mode covers them. A metric with no denominator shows `—` (V36).

export function IncomeApp() {
  const { data, failed, refetch } = useIncome();
  if (!data) {
    if (failed) return <LoadFailed onRetry={() => void refetch()} />;
    return <Skeleton />;
  }
  return <IncomeView payload={data} />;
}

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="bento flex flex-col items-start gap-3 p-5">
      <p className="text-[14px] text-foreground">Income could not load.</p>
      <p className="text-[13px] text-ink-2">The server didn&apos;t answer. Nothing is shown rather than old or sample figures.</p>
      <button type="button" onClick={onRetry} className={buttonClass("surface", "pill-sm")}>
        Try again
      </button>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy aria-label="Loading income">
      <div className="h-10 w-96 max-w-full rounded-pill bg-card-nested" />
      <div className="grid grid-cols-2 gap-2.5 @3xl:grid-cols-4 @3xl:gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-[104px] rounded-card bg-card-nested" />
        ))}
      </div>
      <div className="h-[300px] rounded-card bg-card-nested" />
    </div>
  );
}

const RANGE_OPTIONS: readonly { value: IncomeRange; label: string }[] = [
  { value: "6m", label: "6 months" },
  { value: "12m", label: "12 months" },
  { value: "all", label: "All time" },
];

const PERCENT = new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 1 });

function percent(v: number | null): string {
  return v === null ? "—" : PERCENT.format(v);
}

function IncomeView({ payload }: { payload: IncomePayload }) {
  const owner = useAccount().kind === "owner";
  const now = useIncomeNow();
  const { facts: allFacts, unknown } = useFacts(payload);
  const [productId, setProduct] = useProductParam(payload.products);
  const [range, setRange] = useRangeParam();
  const [currencyParam, setCurrency] = useCurrencyParam();
  const products = React.useMemo(() => new Map(payload.products.map((p) => [p.id, p])), [payload.products]);

  const scoped = React.useMemo(() => inProduct(allFacts, productId), [allFacts, productId]);
  const scopedRevenue = React.useMemo(() => inProduct(payload.revenue, productId), [payload.revenue, productId]);
  const currencies = React.useMemo(() => scopeCurrencies(scoped, scopedRevenue, now), [scoped, scopedRevenue, now]);
  const currency: Currency | undefined = currencies.find((c) => c === currencyParam) ?? currencies[0];
  const facts = React.useMemo(() => (currency ? scoped.filter((f) => f.currency === currency) : []), [scoped, currency]);
  const revenue = React.useMemo(() => scopedRevenue.filter((r) => r.currency === currency), [scopedRevenue, currency]);
  const months = React.useMemo(() => rangeMonths(range, facts, now, revenue), [range, facts, now, revenue]);
  const rows = React.useMemo(() => monthlyRows(facts, months, now), [facts, months, now]);
  const head = React.useMemo(() => headline(facts, now), [facts, now]);
  const [picked, setPicked] = React.useState<string | null>(null);
  // Until a month is picked, the newest one that moved: an untouched month's bridge is two equal bars.
  const selected = rows.find((r) => r.month === picked) ?? rows.findLast((r) => r.net !== 0 || Object.values(r.byKind).some((v) => v !== 0)) ?? rows.at(-1);

  const productOptions = React.useMemo(
    () => [{ value: "all", label: "All products" }, ...payload.products.map((p) => ({ value: p.id, label: p.archived ? `${p.name} (archived)` : p.name }))],
    [payload.products],
  );
  const parityRows = React.useMemo(
    () => parity(payload.snapshots, (productId ? [productId] : payload.products.filter((p) => !p.archived).map((p) => p.id))),
    [payload.snapshots, payload.products, productId],
  );

  // Empty only with neither MRR nor revenue: one-time sales alone still show (review FIX, T42).
  if (!hasIncome(payload)) return <Empty payload={payload} owner={owner} />;
  const hasMrr = facts.length > 0;

  const monthSet = new Set(months);
  const rangeNote = `${RANGE_OPTIONS.find((o) => o.value === range)?.label ?? ""}, months in UTC`;
  const t = head.trailing;

  return (
    <div className="@container/main flex min-w-0 flex-col gap-4">
      <div role="group" aria-label="View" className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {payload.products.length > 1 ? (
          <Segmented
            label="Product"
            value={productId ?? "all"}
            options={productOptions}
            onChange={(v) => {
              setProduct(v === "all" ? null : v);
              setPicked(null);
            }}
          />
        ) : null}
        <Segmented label="Months shown" value={range} options={RANGE_OPTIONS} onChange={setRange} />
        {currencies.length > 1 ? (
          <Segmented
            label="Currency"
            value={currency ?? null}
            options={currencies.map((c) => ({ value: c, label: c }))}
            onChange={(c) => {
              setCurrency(c);
              setPicked(null);
            }}
          />
        ) : null}
      </div>

      {unknown.length > 0 ? (
        <Notice>
          Movements in {unknown.join(", ")} aren&apos;t shown: Wanheda can&apos;t format that currency yet.
        </Notice>
      ) : null}
      {currencies.length > 1 && currency ? <Notice>Figures are in {currency} only. Other currencies are never added in; pick one above.</Notice> : null}

      {currency && !hasMrr ? <Notice>No subscription MRR in {currency}{productId ? " for this product" : ""}: revenue only.</Notice> : null}

      {currency ? (
        <>
          {hasMrr ? (
            <section aria-label="Figures" className="grid grid-cols-2 gap-2.5 @3xl/main:grid-cols-4 @3xl/main:gap-4">
              <Tile label="MRR" note={<>ARR <MoneyText value={{ minor: t.arr, currency }} /></>}>
                <MoneyText roll value={{ minor: t.mrr, currency }} />
              </Tile>
              <Tile label="Net new this month" note={<Delta cur={head.thisMonth} prev={head.lastMonth} goodWhenUp against="vs last month" />}>
                <MoneyText roll sign="always" value={{ minor: head.thisMonth, currency }} />
              </Tile>
              <Tile label="Customers" note="Paying now">
                <span className="tabular">{t.customers.toLocaleString("en-GB")}</span>
              </Tile>
              <Tile label="ARPA" note="MRR per customer">
                {t.arpa === null ? <Dash /> : <MoneyText value={{ minor: t.arpa, currency }} />}
              </Tile>
              <Tile label="Customer churn" note="Last 30 days">
                <span className="tabular">{percent(t.customerChurn)}</span>
              </Tile>
              <Tile label="Net MRR churn" note="Last 30 days; below 0 is growth">
                <span className="tabular">{percent(t.netMrrChurn)}</span>
              </Tile>
              <Tile label="LTV" note="ARPA ÷ customer churn">
                {t.ltv === null ? <Dash /> : <MoneyText value={{ minor: t.ltv, currency }} />}
              </Tile>
              <Tile label="New sign-ups" note="Paid for the first time, last 30 days">
                <span className="tabular">{newCustomers(facts, now).toLocaleString("en-GB")}</span>
              </Tile>
            </section>
          ) : null}

          <div className="grid grid-cols-1 items-start gap-4 @4xl/main:grid-cols-2">
            {hasMrr ? (
              <>
                <TrendLine title="MRR over time" note={rangeNote} months={months} values={rows.map((r) => r.mrr)} partialLast currency={currency} />
                <TrendLine title="Customers over time" note="Paying customers at each month's end" months={months} values={rows.map((r) => r.customers)} partialLast unit="Customers" />
                <MovementBars rows={rows} currency={currency} selected={selected?.month ?? monthOf(now)} onSelect={setPicked} note="Pick a month to see its bridge" />
                {selected ? <Waterfall row={selected} currency={currency} /> : null}
              </>
            ) : null}
            {productId === null ? (
              <RevenueByProduct rows={revenueByProduct(revenue, monthSet, currency)} products={products} currency={currency} note={`Paid orders less refunds, before tax. ${rangeNote}`} />
            ) : (
              <RevenueByMonth months={months} values={revenueByMonthFor(revenue, months, productId, currency)} currency={currency} note="Paid orders less refunds, before tax" />
            )}
            <ParityCard rows={parityRows} products={products} />
          </div>
        </>
      ) : (
        <EmptyState title="Nothing for this product yet" body="No paying subscriptions or paid orders yet, or it isn't mapped to a Polar product." />
      )}
    </div>
  );
}

/** Customers with a `new` movement (first paid on a product) in the last 30 days, each counted once. */
function newCustomers(facts: readonly { occurredAt: Date; kind: string; customerRef: string }[], now: Date): number {
  const since = now.getTime() - 30 * 86_400_000;
  const seen = new Set<string>();
  for (const f of facts) {
    const t = f.occurredAt.getTime();
    if (f.kind === "new" && t > since && t <= now.getTime()) seen.add(f.customerRef);
  }
  return seen.size;
}

function Dash() {
  return (
    <span className="text-ink-3" title="No denominator yet">
      —
    </span>
  );
}

function Tile({ label, note, children }: { label: string; note: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bento flex min-w-0 flex-col gap-2 p-4 @3xl/main:p-5">
      <h3 className="readout truncate">{label}</h3>
      <div className="truncate font-display text-[22px] leading-none font-semibold tracking-[-0.01em] text-foreground @3xl/main:text-[28px]">{children}</div>
      <div className="min-w-0 truncate text-[12px] text-ink-2">{note}</div>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="rounded-[14px] bg-card-nested px-3 py-2 text-[13px] text-ink-2">
      {children}
    </p>
  );
}

function Empty({ payload, owner }: { payload: IncomePayload; owner: boolean }) {
  const connect = (
    <Link href="/settings?s=connections" className={buttonClass("surface", "pill-sm", "mt-4")}>
      Open connections
    </Link>
  );
  if (!owner) return <EmptyState title="No sample income" body="The demo has no income figures to show." />;
  if (!payload.available) {
    return <EmptyState title="Connectors are off" body="Income needs a database and a connector seal key on the server. Your other apps are unaffected." />;
  }
  if (payload.connectors === 0) {
    return (
      <EmptyState
        title="Connect Polar to see income"
        body={
          <>
            Add a Polar access token and map its products to yours. MRR, churn and revenue fill in after the first sync.
            {connect}
          </>
        }
      />
    );
  }
  return (
    <EmptyState
      title="No MRR movements yet"
      body={
        <>
          Map a Polar product to one of yours, then Sync now. Subscriptions that have paid show up here.
          {connect}
        </>
      }
    />
  );
}
