"use client";

import Link from "next/link";
import * as React from "react";
import { ChartColumnStacked, TrendingUp } from "lucide-react";
import { KIND_META, KIND_ORDER } from "@/components/income/charts/kit";
import { useFacts, useIncome, useIncomeNow } from "@/components/income/use-income";
import { Delta } from "@/components/money/charts/chart-kit";
import { MoneyText } from "@/components/money/money-text";
import { useAccount } from "@/components/shell/account";
import { buttonClass } from "@/components/ui/button";
import { currenciesOf, headline, type IncomePayload } from "@/lib/saas/income";
import { metrics } from "@/lib/saas/mrr";
import { cn } from "@/lib/utils";
import { SampleChip, WidgetCard } from "./widget-card";

// Home's income widgets (T42): MRR now, and this month's net new MRR by kind.
// They read the income cache /income shares (V24), so after a hop from Income
// they paint at once. Every product together, in the currency holding the
// most MRR (never summed across currencies, V25).

function Loading() {
  return <div aria-busy aria-label="Loading" className="h-full min-h-12 rounded-[14px] bg-card-nested" />;
}

/** The facts in the main currency, or null when there are no movements. */
function useMain(payload: IncomePayload) {
  const now = useIncomeNow();
  const { facts } = useFacts(payload);
  return React.useMemo(() => {
    const currencies = currenciesOf(facts, now);
    const currency = currencies[0];
    if (!currency) return null;
    const main = facts.filter((f) => f.currency === currency);
    return { currency, others: currencies.length - 1, facts: main, now };
  }, [facts, now]);
}

function NoIncome() {
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-[13px] text-ink-2">No MRR yet. Connect Polar and map your products.</p>
      <Link href="/settings?s=connections" className={buttonClass("surface", "pill-sm")}>
        Open connections
      </Link>
    </div>
  );
}

function Shell({ title, icon, children }: { title: string; icon: typeof TrendingUp; children: (payload: IncomePayload) => React.ReactNode }) {
  const { data } = useIncome();
  const demo = useAccount().kind !== "owner";
  return (
    <WidgetCard title={title} icon={icon} note={demo ? <SampleChip /> : undefined}>
      {data ? children(data) : <Loading />}
    </WidgetCard>
  );
}

export function IncomeMrrWidget() {
  return <Shell title="MRR" icon={TrendingUp}>{(p) => <MrrBody payload={p} />}</Shell>;
}

function MrrBody({ payload }: { payload: IncomePayload }) {
  const main = useMain(payload);
  if (!main) return <NoIncome />;
  const { currency, facts, now, others } = main;
  const m = metrics(facts, new Date(now.getTime() - 30 * 86_400_000), now);
  return (
    <Link href="/income" className="flex min-h-0 flex-1 flex-col justify-between gap-3 rounded-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <MoneyText roll value={{ minor: m.mrr, currency }} className="font-display text-[28px] leading-none font-semibold tracking-[-0.01em] text-foreground" />
      <span className="flex flex-col gap-1">
        <Delta cur={m.mrr} prev={m.mrr - m.netNew} goodWhenUp against="vs 30 days ago" />
        <span className="tabular truncate text-[12.5px] text-ink-2">
          {m.customers.toLocaleString("en-GB")} paying {m.customers === 1 ? "customer" : "customers"}
          {others > 0 ? ` · ${currency} only` : ""}
        </span>
      </span>
    </Link>
  );
}

export function IncomeNetNewWidget() {
  return <Shell title="Net new MRR" icon={ChartColumnStacked}>{(p) => <NetNewBody payload={p} />}</Shell>;
}

function NetNewBody({ payload }: { payload: IncomePayload }) {
  const main = useMain(payload);
  if (!main) return <NoIncome />;
  const { currency, facts, now } = main;
  const h = headline(facts, now);
  return (
    <Link href="/income" className="flex min-h-0 flex-1 flex-col gap-3 rounded-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <MoneyText roll sign="always" value={{ minor: h.thisMonth, currency }} className="font-display text-[28px] leading-none font-semibold tracking-[-0.01em] text-foreground" />
        <Delta cur={h.thisMonth} prev={h.lastMonth} goodWhenUp against="vs last month" />
      </span>
      <ul className="flex min-h-0 flex-col gap-1.5 overflow-y-auto text-[12.5px]">
        {KIND_ORDER.map((k) => (
          <li key={k} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-ink-2">
              <span aria-hidden className={cn("size-2 rounded-[3px]", KIND_META[k].bg)} />
              {KIND_META[k].label}
            </span>
            <MoneyText sign="always" value={{ minor: h.thisMonthByKind[k], currency }} className="text-foreground" />
          </li>
        ))}
      </ul>
    </Link>
  );
}
