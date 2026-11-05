"use client";

import * as React from "react";
import { MoneyLoadFailed } from "@/components/money/money-app";
import { ConvertedStack, MoneyText } from "@/components/money/money-text";
import { useFx, useLedger, useMoney, useToday } from "@/components/money/use-money";
import { Segmented } from "@/components/ui/segmented";
import { isCurrency } from "@/lib/money/currency";
import { byId, type MoneyPayload } from "@/lib/money/money";
import { cashIn, monthsTo, netByMonth, runwayMonths, type NetMonth } from "@/lib/money/net";
import type { IncomeRange, RevenueMonth } from "@/lib/saas/income";
import { NetBars } from "./charts/net-bars";
import { Dash, Notice, Tile } from "./parts";
import { useIncome, useRangeParam } from "./use-income";

// The net view (T43, FR-INCOME-1): ledger income − spending per month, the
// savings rate, cash and runway, all in the base currency (V26). SaaS revenue
// is shown beside, never added: a Polar payout lands in a bank account as a
// ledger entry, so adding both would count it twice (user 2026-11-05).

const RANGE_OPTIONS: readonly { value: Exclude<IncomeRange, "all">; label: string }[] = [
  { value: "6m", label: "6 months" },
  { value: "12m", label: "12 months" },
];

const PERCENT = new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 1 });
const MONTHS = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });

export function NetView() {
  const { data, failed, refetch } = useMoney();
  if (!data) {
    if (failed) return <MoneyLoadFailed onRetry={() => void refetch()} />;
    return (
      <div className="flex flex-col gap-4" aria-busy aria-label="Loading net">
        <div className="grid grid-cols-2 gap-2.5 @3xl:grid-cols-4 @3xl:gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-[104px] rounded-card bg-card-nested" />
          ))}
        </div>
        <div className="h-[300px] rounded-card bg-card-nested" />
      </div>
    );
  }
  return <Net payload={data} />;
}

/** SaaS revenue (orders less refunds) per currency in one month, for the line beside the ledger. */
function revenueIn(revenue: readonly RevenueMonth[], month: string): { minor: number; currency: string }[] {
  const by = new Map<string, number>();
  for (const r of revenue) if (r.month === month) by.set(r.currency, (by.get(r.currency) ?? 0) + r.ordersMinor + r.refundsMinor);
  return [...by.entries()].filter(([, v]) => v !== 0).map(([currency, minor]) => ({ currency, minor }));
}

function Revenue({ items }: { items: readonly { minor: number; currency: string }[] }) {
  const known = items.filter((m) => isCurrency(m.currency));
  if (known.length === 0) return <Dash />;
  return (
    <>
      {known.map((m, i) => (
        <span key={m.currency}>
          {i > 0 ? " · " : ""}
          {isCurrency(m.currency) ? <MoneyText value={{ minor: m.minor, currency: m.currency }} /> : null}
        </span>
      ))}
    </>
  );
}

function Net({ payload }: { payload: MoneyPayload }) {
  const today = useToday(payload.timeZone);
  const [rangeParam, setRange] = useRangeParam();
  const range = rangeParam === "6m" ? "6m" : "12m";
  const months = React.useMemo(() => monthsTo(today, range === "6m" ? 6 : 12), [today, range]);
  const from = months[0]?.from ?? today;
  const ledger = useLedger(payload, from, today);
  const fx = useFx(from);
  const categories = React.useMemo(() => byId(payload.categories), [payload.categories]);
  const base = payload.baseCurrency;
  const rows = React.useMemo(() => netByMonth(ledger.txns, categories, months, base, fx.table, today), [ledger.txns, categories, months, base, fx.table, today]);
  const cash = React.useMemo(
    () => cashIn(payload.accounts, payload.priorMinor, payload.txns, payload.since, base, fx.table, today),
    [payload.accounts, payload.priorMinor, payload.txns, payload.since, base, fx.table, today],
  );
  const runway = runwayMonths(cash.total.minor, rows);
  const revenue = useIncome().data?.revenue ?? [];
  const current: NetMonth | undefined = rows.at(-1);
  const dim = ledger.loadingOlder || fx.loading;

  return (
    <div className="@container/main flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Segmented label="Months shown" value={range} options={RANGE_OPTIONS} onChange={setRange} />
      </div>
      {ledger.olderFailed ? <Notice>Older entries couldn&apos;t load, so months before the last three may be short.</Notice> : null}
      {ledger.truncated ? <Notice>The older read hit its row limit, so the earliest months are short.</Notice> : null}

      <section aria-label="Figures" className="grid grid-cols-2 gap-2.5 @3xl/main:grid-cols-4 @3xl/main:gap-4">
        <Tile compact label="Net this month" note={current ? <>Income <MoneyText value={current.income.total} /> − spending <MoneyText value={current.spend.total} /></> : null}>
          {current ? <ConvertedStack roll value={current.net} /> : <Dash />}
        </Tile>
        <Tile label="Savings rate" note="Net ÷ income, this month">
          {current?.savingsRate == null ? <Dash /> : <span className="tabular">{PERCENT.format(current.savingsRate)}</span>}
        </Tile>
        <Tile compact label="Cash" note="Open accounts, today">
          <ConvertedStack value={cash} />
        </Tile>
        <Tile label="Runway" note="Cash ÷ average spending, last 3 full months with entries">
          {runway === null ? <Dash /> : <span className="tabular">{MONTHS.format(runway)} {runway === 1 ? "month" : "months"}</span>}
        </Tile>
      </section>

      <NetBars
        rows={rows}
        currency={base}
        dim={dim}
        note={`Ledger only, in ${base}. Other currencies converted at each day's rate.`}
        extraHead="SaaS revenue (not added)"
        extraCell={(r) => <Revenue items={revenueIn(revenue, r.month)} />}
      />

      <div className="bento flex flex-col gap-1.5 p-5">
        <h3 className="readout">SaaS revenue this month</h3>
        <p className="font-display text-[22px] leading-none font-semibold text-foreground">
          <Revenue items={revenueIn(revenue, today.slice(0, 7))} />
        </p>
        <p className="text-[12.5px] text-ink-2">
          Paid orders less refunds from your products, before tax. Shown beside the ledger, never added: a payout reaches your bank as ledger income, so adding both would count it twice.
        </p>
      </div>
    </div>
  );
}
