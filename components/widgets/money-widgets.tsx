"use client";

import Link from "next/link";
import * as React from "react";
import { CalendarClock, Plus, Target, Wallet } from "lucide-react";
import { useBudgetProgress } from "@/components/money/budgets";
import { PinnedCycle } from "@/components/money/renewal-cycle";
import { CategoryMark, ConvertedStack, MoneyText } from "@/components/money/money-text";
import { useFx, useMoney, useToday, windowFxFrom } from "@/components/money/use-money";
import { useAccount } from "@/components/shell/account";
import { usePalette } from "@/components/shell/palette-store";
import { buttonClass } from "@/components/ui/button";
import { budgetName, BUDGETS_HREF } from "@/lib/money/budgets";
import { convertedTotals } from "@/lib/money/converted";
import { DEFAULT_TIME_ZONE, startOfMonth } from "@/lib/money/dates";
import { byId, type MoneyPayload } from "@/lib/money/money";
import { SUBSCRIPTIONS_HREF } from "@/lib/money/subscriptions";
import { cn } from "@/lib/utils";
import { SampleChip, WidgetCard } from "./widget-card";

// Home's money widgets (T38): today's spend, budgets and a billing cycle.
// They read the money cache every money page shares (V24), so after a hop
// from Money they paint at once; on a cold start they fetch it once. Figures
// go through <MoneyText>, so privacy mode covers them (V25).

function useMoneyWidget(): { payload: MoneyPayload | null; demo: boolean } {
  const { data } = useMoney();
  const demo = useAccount().kind !== "owner";
  return { payload: data, demo };
}

function Loading() {
  return <div aria-busy aria-label="Loading" className="h-full min-h-12 rounded-[14px] bg-card-nested" />;
}

export function MoneyTodayWidget() {
  const { payload, demo } = useMoneyWidget();
  return (
    <WidgetCard title="Spent today" icon={Wallet} note={demo ? <SampleChip /> : undefined}>
      {payload ? <TodayBody payload={payload} /> : <Loading />}
    </WidgetCard>
  );
}

function TodayBody({ payload }: { payload: MoneyPayload }) {
  const today = useToday(payload.timeZone);
  const fx = useFx(windowFxFrom(payload)).table;
  const setOpen = usePalette((s) => s.setOpen);
  const categories = React.useMemo(() => byId(payload.categories), [payload.categories]);
  const day = convertedTotals(payload.txns, categories, today, today, payload.baseCurrency, fx);
  const month = convertedTotals(payload.txns, categories, startOfMonth(today), today, payload.baseCurrency, fx);
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-between gap-3">
      <div className="min-w-0">
        <ConvertedStack roll value={day.spend} className="font-display text-[28px] leading-none font-semibold tracking-[-0.01em] text-foreground" />
        <p className="tabular mt-2 truncate text-[12.5px] text-ink-2">
          <MoneyText value={month.spend.total} /> this month
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass("surface", "pill-sm")}
          onClick={() => {
            setOpen(true);
          }}
        >
          <Plus aria-hidden />
          Add
        </button>
        <Link href="/money" className={buttonClass("ghost", "pill-sm")}>
          Entries
        </Link>
      </div>
    </div>
  );
}

export function MoneyBudgetWidget() {
  const { payload, demo } = useMoneyWidget();
  return (
    <WidgetCard title="Budgets" icon={Target} note={demo ? <SampleChip /> : undefined}>
      {payload ? <BudgetBody payload={payload} /> : <Loading />}
    </WidgetCard>
  );
}

const FILL = { 0: "bg-signal", 80: "bg-warn", 100: "bg-destructive" } as const;
const TRACK = { 0: "bg-signal-soft", 80: "bg-warn/15", 100: "bg-destructive/15" } as const;

function BudgetBody({ payload }: { payload: MoneyPayload }) {
  const today = useToday(payload.timeZone);
  const progress = useBudgetProgress(payload, today);
  const categories = React.useMemo(() => byId(payload.categories), [payload.categories]);
  if (progress.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-[13px] text-ink-2">No budgets yet. Set one and you&apos;ll hear at 80 % and 100 %.</p>
        <Link href={BUDGETS_HREF} className={buttonClass("surface", "pill-sm")}>
          <Plus aria-hidden />
          Set a budget
        </Link>
      </div>
    );
  }
  return (
    <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto scroll-fade">
      {progress.map((p) => {
        const name = budgetName(p.budget, categories);
        const pct = Number.isFinite(p.share) ? Math.round(p.share * 100) : null;
        const category = p.budget.categoryId ? (categories.get(p.budget.categoryId) ?? null) : null;
        return (
          <li key={p.budget.id}>
            <Link href={BUDGETS_HREF} className="flex flex-col gap-1.5 rounded-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="flex items-center justify-between gap-3 text-[13px]">
                <span className="flex min-w-0 items-center gap-2 text-foreground">
                  {category ? <CategoryMark category={category} className="size-6 text-[12px]" /> : null}
                  <span className="truncate">{name}</span>
                </span>
                <span className="tabular shrink-0 text-ink-2">
                  <MoneyText value={p.spent} /> / <MoneyText value={p.limit} />
                </span>
              </span>
              <span
                role="progressbar"
                aria-label={`${name} budget used`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(100, pct ?? 100)}
                className={cn("block h-1.5 overflow-hidden rounded-full", TRACK[p.level])}
              >
                <span className={cn("block h-full rounded-full", FILL[p.level])} style={{ width: `${String(Math.min(100, pct ?? 100))}%` }} />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Home's billing cycle (user 2026-11-05): the liquid card of one active
 * subscription, filling the widget; with several, a picker on the card pins
 * the one to show. The id stays `money.renewals`: it is stored in layouts.
 */
export function MoneyRenewalsWidget() {
  const { payload, demo } = useMoneyWidget();
  const today = useToday(payload?.timeZone ?? DEFAULT_TIME_ZONE);
  const active = payload?.subscriptions?.some((s) => s.status === "active") ?? false;
  if (payload && active) return <PinnedCycle subscriptions={payload.subscriptions ?? []} today={today} base={payload.baseCurrency} />;
  return (
    <WidgetCard title="Billing cycle" icon={CalendarClock} note={demo ? <SampleChip /> : undefined}>
      {payload ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-[13px] text-ink-2">No active subscriptions. Add one and its billing cycle shows here.</p>
          <Link href={SUBSCRIPTIONS_HREF} className={buttonClass("surface", "pill-sm")}>
            Subscriptions
          </Link>
        </div>
      ) : (
        <Loading />
      )}
    </WidgetCard>
  );
}
