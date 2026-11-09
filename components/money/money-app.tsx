"use client";

import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";
import { ChevronLeft, ChevronRight, Plus, Trash2, Upload, X } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/calendar";
import { GrowDialog } from "@/components/ui/grow-dialog";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tip } from "@/components/ui/tooltip";
import { budgetProgress } from "@/lib/money/budgets";
import { convertedNet, convertedTotals, inBase } from "@/lib/money/converted";
import type { Currency, Money } from "@/lib/money/currency";
import { addDays, todayIn, type Day } from "@/lib/money/dates";
import type { Converted, FxTable } from "@/lib/money/fx";
import type { MoneyFilter } from "@/lib/money/list-filter";
import { byId, TXN_LIST_LIMIT, type Account, type Category, type MoneyPayload, type Txn } from "@/lib/money/money";
import {
  bucketsOf,
  bucketSizeOf,
  comparisonOf,
  customPeriod,
  daysOf,
  endSoFar,
  isCurrent,
  nextPeriod,
  periodAt,
  periodTitle,
  previousPeriod,
  rangeLabel,
  type Period,
  type PeriodKind,
} from "@/lib/money/periods";
import { breakdown, bucketTotals, cumulative, currenciesIn, dailyTotals, NONE, normalPayee, type GroupBy, type Side } from "@/lib/money/reports";
import { cn } from "@/lib/utils";
import { AccountsCard } from "./accounts";
import { Breakdown } from "./breakdown";
import { Delta } from "./charts/chart-kit";
import { PaceLine } from "./charts/pace-line";
import { SpendBars } from "./charts/spend-bars";
import { SpendHeatmap } from "./charts/spend-heatmap";
import { ConvertedStack } from "./money-text";
import { TxnForm } from "./txn-form";
import { TxnList, type Editing } from "./txn-list";
import { useFx, useLedger, useMoney, useMoneyApi, useToday, windowFxFrom } from "./use-money";
import { entriesHref, useListFilter, usePeriod } from "./use-period";

// Money (FRD 6.3): a period (day, week, month or custom, in `?p=`) set
// against the one before it, with totals, the period's entries (first: the
// ledger is what the owner opens this for), charts and the accounts. Paints
// from the cache at once; the page's Prefetch refreshes it (SPEC V24). Every
// figure is one currency's integers (V25); periods are calendar days in the
// owner's zone (V27).

export type MoneyPage = "entries" | "analytics";

export function MoneyApp({ view }: { view: MoneyPage }) {
  const { data, failed, refetch } = useMoney();
  if (!data) {
    if (failed) return <MoneyLoadFailed onRetry={() => void refetch()} />;
    return <MoneySkeleton />;
  }
  return <MoneyView payload={data} view={view} />;
}

/** The first load failed and nothing is on the device: say so, never show sample figures. */
export function MoneyLoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="bento flex flex-col items-start gap-3 p-5">
      <p className="text-[14px] text-foreground">Money could not load.</p>
      <p className="text-[13px] text-ink-2">The server didn&apos;t answer. Nothing is shown rather than old or sample figures.</p>
      <button type="button" onClick={onRetry} className={buttonClass("surface", "pill-sm")}>
        Try again
      </button>
    </div>
  );
}

function MoneySkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy aria-label="Loading money">
      <div className="h-10 w-80 max-w-full rounded-pill bg-card-nested" />
      <div className="grid grid-cols-1 gap-2.5 @xl:grid-cols-3 @xl:gap-4">
        <div className="h-16 rounded-card bg-card-nested @xl:h-[132px]" />
        <div className="h-16 rounded-card bg-card-nested @xl:h-[132px]" />
        <div className="h-16 rounded-card bg-card-nested @xl:h-[132px]" />
      </div>
      <div className="h-[420px] rounded-card bg-card-nested" />
    </div>
  );
}

const KIND_OPTIONS: readonly { value: PeriodKind; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "custom", label: "Custom" },
];

interface Scope {
  payload: MoneyPayload;
  today: Day;
  period: Period;
  previous: Period;
  compare: ReturnType<typeof comparisonOf>;
  /** Every txn the period and the one before it need, pending writes laid over. */
  txns: Txn[];
  categories: ReadonlyMap<string, Category>;
  accounts: ReadonlyMap<string, Account>;
  /** The currency charts and breakdowns are in. */
  currency: Currency;
  /** The txns charts and breakdowns read: as entered, or all converted into `currency` ("all in …"). */
  chartTxns: Txn[];
  /** Per currency, what had no rate and is left out of `chartTxns`. */
  left: Money[];
  fx: FxTable;
  against: string;
  /** Older entries are still loading. */
  dim: boolean;
}

/** "all": every currency converted into the base one (V26). */
type ChartCurrency = Currency | "all";

/** The period, the txns it needs and the totals both pages head with. */
function MoneyView({ payload, view }: { payload: MoneyPayload; view: MoneyPage }) {
  const today = useToday(payload.timeZone);
  const [period, setPeriod] = usePeriod(today);
  const categories = React.useMemo(() => byId(payload.categories), [payload.categories]);
  const accounts = React.useMemo(() => byId(payload.accounts), [payload.accounts]);
  const base = payload.baseCurrency;

  const previous = previousPeriod(period);
  const compare = comparisonOf(period, today);
  // The previous period starts no later than the comparison, so one read covers both.
  const ledger = useLedger(payload, previous.from, period.to);
  const txns = ledger.txns;

  // Rates from the earliest day shown (the window's, or an older period's), in their own cache (V24).
  const windowFrom = windowFxFrom(payload);
  const fx = useFx(previous.from < windowFrom ? previous.from : windowFrom).table;

  const currencies = currenciesIn(txns, categories, { from: previous.from, to: period.to }, base);
  const [picked, setPicked] = React.useState<ChartCurrency | null>(null);
  const mixed = currencies.length > 1;
  const chart: ChartCurrency =
    picked === "all" && mixed ? "all" : picked && picked !== "all" && currencies.includes(picked) ? picked : mixed && !fx.empty ? "all" : (currencies[0] ?? base);
  const currency = chart === "all" ? base : chart;
  const converted = React.useMemo(() => (chart === "all" ? inBase(txns, base, fx) : { txns, left: [] }), [chart, txns, base, fx]);

  // Headline totals: always in the base currency, exact, rounded once (V26).
  const cur = convertedTotals(txns, categories, period.from, period.to, base, fx);
  const was = convertedTotals(txns, categories, compare.from, compare.to, base, fx);
  const net = convertedNet(cur);
  const compareTitle = periodTitle(compare, today);
  const against = period.kind === "day" ? `vs ${compareTitle === "Yesterday" ? "yesterday" : compareTitle}` : `vs ${rangeLabel(compare.from, compare.to, today)}`;
  const stale = payload.source === "load-failed";

  const scope: Scope = {
    payload,
    today,
    period,
    previous,
    compare,
    txns,
    categories,
    accounts,
    currency,
    chartTxns: converted.txns,
    left: converted.left,
    fx,
    against,
    dim: ledger.loadingOlder,
  };

  return (
    <div className="flex flex-col gap-6">
      <PeriodBar period={period} onChange={setPeriod} today={today} currencies={currencies} base={base} chart={chart} onChart={setPicked} />

      {payload.source === "demo" ? null : stale ? (
        <Notice>Showing what this device last loaded. The server didn&apos;t answer.</Notice>
      ) : payload.windowTruncated ? (
        <Notice>
          The last three months hold more entries than one read returns, so the oldest of them are missing: balances and totals before the newest{" "}
          {TXN_LIST_LIMIT.toLocaleString("en-GB")} entries are short.
        </Notice>
      ) : ledger.olderFailed ? (
        <Notice>Entries before {rangeLabel(payload.since, payload.since, today)} could not load, so figures before then are missing.</Notice>
      ) : ledger.truncated ? (
        <Notice>This range holds more entries than one read returns, so its older totals are short. Pick a shorter range.</Notice>
      ) : null}

      {/* Three across only from @4xl; below, one row per total. Across, the amount scales with the page
          column (2.6cqi, at most 30px), so a long one like -₦549,958.85 stays inside its card (user 2026-11-08). */}
      <section aria-label="Totals" className="grid grid-cols-1 gap-2.5 @4xl:grid-cols-3 @4xl:gap-4">
        <Stat label="Spent" note={rangeLabel(period.from, period.to, today)} value={cur.spend}>
          <Delta cur={cur.spend.total.minor} prev={was.spend.total.minor} goodWhenUp={false} against={against} />
        </Stat>
        <Stat label="Received" note={rangeLabel(period.from, period.to, today)} value={cur.income}>
          <Delta cur={cur.income.total.minor} prev={was.income.total.minor} goodWhenUp against={against} />
        </Stat>
        <Stat label="Net" note={cur.count === 1 ? "1 entry" : `${String(cur.count)} entries`} value={net}>
          <span className="text-[12px] text-ink-2">Received minus spent</span>
        </Stat>
      </section>

      {view === "entries" ? <EntriesView scope={scope} /> : <AnalyticsView scope={scope} />}
    </div>
  );
}

/** The ledger: the period's entries first (what the page is opened for), the add form and accounts beside them. */
function EntriesView({ scope }: { scope: Scope }) {
  const { payload, today, period, txns, categories, accounts } = scope;
  const [filterKey, clearFilter] = useListFilter();
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const periodTxns = React.useMemo(() => txns.filter((t) => t.postedOn >= period.from && t.postedOn <= period.to), [txns, period]);
  const filter = React.useMemo(
    () => (filterKey ? { ...filterKey, label: filterLabel(filterKey, categories, accounts, periodTxns) } : null),
    [filterKey, categories, accounts, periodTxns],
  );

  return (
    <div className="grid grid-cols-1 items-start gap-6 @4xl:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
      <section aria-labelledby="money-entries" className="flex min-w-0 flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="money-entries" className="font-display text-[17px] leading-tight text-foreground">
            Entries · {periodTitle(period, today)}
          </h2>
          <Link href="/money/import" className={buttonClass("surface", "pill-sm", "shrink-0")}>
            <Upload aria-hidden />
            Import
          </Link>
        </div>
        <TxnList
          txns={periodTxns}
          today={today}
          categories={categories}
          accounts={accounts}
          filter={filter}
          onClearFilter={clearFilter}
          onEdit={setEditing}
          emptyHint={
            payload.txns.length === 0 ? (
              <>
                Type <span className="tabular font-medium text-foreground">4500 food jollof</span> into the palette (Ctrl K), or use the form.
              </>
            ) : (
              "Pick another period, or add one with the form."
            )
          }
        />
      </section>

      <aside aria-label="Add and accounts" className="flex min-w-0 flex-col gap-6">
        <section aria-label="Add a transaction" className="bento hidden p-5 @4xl:block">
          <h2 className="mb-4 font-display text-[17px] leading-tight text-foreground">Add</h2>
          <TxnForm payload={payload} today={today} variant="inline" />
        </section>
        <AccountsCard payload={payload} />
      </aside>

      <AddSheet payload={payload} today={today} open={sheetOpen} setOpen={setSheetOpen} />
      <EditDialog
        payload={payload}
        today={today}
        editing={editing}
        close={() => {
          setEditing(null);
        }}
      />
    </div>
  );
}

/** The period's charts and breakdown. A breakdown row opens the entries page filtered to it. */
function AnalyticsView({ scope }: { scope: Scope }) {
  const { payload, today, period, previous, compare, chartTxns: txns, categories, accounts, currency, against, dim, left, fx } = scope;
  const router = useRouter();
  const [by, setBy] = React.useState<GroupBy>("category");
  const [side, setSide] = React.useState<Side>("spend");

  const rows = React.useMemo(
    () => breakdown({ txns, categories, range: period, prev: compare, currency, side, by }),
    [txns, categories, period, compare.from, compare.to, currency, side, by], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const size = bucketSizeOf(period);
  /** The bucket size when the period has charts: more than one day, and not all in the future. */
  const charts = size !== null && period.from <= today ? size : null;
  const daily = React.useMemo(() => dailyTotals(txns, categories, period, currency, "spend"), [txns, categories, period, currency]);
  const prevDaily = React.useMemo(() => dailyTotals(txns, categories, previous, currency, "spend"), [txns, categories, previous.from, previous.to, currency]); // eslint-disable-line react-hooks/exhaustive-deps
  // A month's overall budget in the chart's currency joins the pace line (FR-MONEY-6).
  const overall = period.kind === "month" ? payload.budgets?.find((b) => b.categoryId === null && b.currency === currency) : undefined;
  const budgetLimit = overall
    ? budgetProgress(overall, scope.txns, categories, period.from, todayIn(payload.timeZone, new Date(overall.createdAt)), fx).limit.minor
    : undefined;

  return (
    <div className="@container/main flex min-w-0 flex-col gap-4">
      {left.length > 0 ? (
        <Notice>
          {left.map((m) => m.currency).join(", ")} entries with no rate on or before their day are left out of these charts. Pick that currency above to see
          them.
        </Notice>
      ) : null}
      {charts ? (
        <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2">
          <SpendBars buckets={bucketsOf(period)} values={bucketTotals(daily, bucketsOf(period))} size={charts} currency={currency} today={today} dim={dim} note={`Per ${charts}`} />
          <PaceLine
            current={cumulative(daily, period.from, endSoFar(period, today))}
            previous={cumulative(prevDaily, previous.from, previous.to)}
            currentDays={daysOf(period.from, period.to)}
            previousDays={daysOf(previous.from, previous.to)}
            currency={currency}
            dim={dim}
            note={`Against ${rangeLabel(previous.from, previous.to, today)}`}
            budget={budgetLimit}
          />
        </div>
      ) : period.kind === "day" ? (
        <Notice>Charts need more than one day. Pick Week, Month or Custom above.</Notice>
      ) : null}
      <div className={cn("grid grid-cols-1 items-start gap-4", charts && "@xl/main:grid-cols-2")}>
        {charts ? <SpendHeatmap from={period.from} to={period.to} today={today} daily={daily} currency={currency} dim={dim} note="Darker is more" /> : null}
        <Breakdown
          rows={rows}
          by={by}
          onBy={setBy}
          side={side}
          onSide={setSide}
          categories={categories}
          accounts={accounts}
          currency={currency}
          against={against}
          picked={null}
          onPick={(f) => {
            if (f) router.push(entriesHref(period, today, { by: f.by, key: f.key }) as Route);
          }}
        />
      </div>
    </div>
  );
}

/** What the filter chip says: the row's name as the breakdown shows it. */
function filterLabel(f: MoneyFilter, categories: ReadonlyMap<string, Category>, accounts: ReadonlyMap<string, Account>, txns: readonly Txn[]): string {
  if (f.by === "account") return accounts.get(f.key)?.name ?? "Unknown account";
  if (f.by === "payee") {
    if (f.key === NONE) return "No payee";
    // Newest first, so this is the latest spelling, as in the breakdown.
    return txns.find((t) => normalPayee(t.payee) === f.key)?.payee.trim() ?? f.key;
  }
  if (f.key === NONE) return "No category";
  return categories.get(f.key)?.name ?? "Unknown category";
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="rounded-[14px] bg-card-nested px-3 py-2 text-[13px] text-ink-2 ring-1 ring-border dark:ring-glass-border">
      {children}
    </p>
  );
}

/** The one filter row above everything it scopes (dataviz): period kind, stepper or custom days, chart currency. */
function PeriodBar({
  period,
  onChange,
  today,
  currencies,
  base,
  chart,
  onChart,
}: {
  period: Period;
  onChange: (p: Period) => void;
  today: Day;
  currencies: readonly Currency[];
  base: Currency;
  chart: ChartCurrency;
  onChart: (c: ChartCurrency) => void;
}) {
  const options: { value: ChartCurrency; label: string }[] = [
    { value: "all", label: `Charts: all in ${base}` },
    ...currencies.map((c) => ({ value: c, label: `Charts: ${c} only` })),
  ];
  const next = nextPeriod(period);
  const canNext = next.from <= today;
  const prev = previousPeriod(period);
  const step = (p: Period) => {
    onChange(p);
  };
  return (
    <div role="group" aria-label="Period" className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <Segmented
        label="Period kind"
        value={period.kind}
        options={KIND_OPTIONS}
        onChange={(k) => {
          if (k === period.kind) return;
          onChange(k === "custom" ? customPeriod(addDays(today, -29), today) : periodAt(k, today));
        }}
      />
      {/* h-10 like the rest of the row: a taller field re-centres the row and nudges the period pill. */}
      {period.kind === "custom" ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-44">
            <DatePicker
              className="h-10"
              value={period.from}
              max={period.to}
              today={today}
              onChange={(d) => {
                onChange(customPeriod(d, period.to));
              }}
            />
          </div>
          <span aria-hidden className="text-ink-3">
            –
          </span>
          <div className="w-44">
            <DatePicker
              className="h-10"
              value={period.to}
              min={period.from}
              max={today}
              today={today}
              presets={[{ label: "Today", day: today }]}
              onChange={(d) => {
                onChange(customPeriod(period.from, d));
              }}
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <Tip
            label={`Previous: ${periodTitle(prev, today)}`}
            render={
              <button
                type="button"
                onClick={() => {
                  step(prev);
                }}
                className={buttonClass("ghost", "circle-sm", "size-8")}
              >
                <ChevronLeft aria-hidden className="size-4" />
                <span className="sr-only">Previous {period.kind}</span>
              </button>
            }
          />
          <p className="min-w-0 px-1" aria-live="polite">
            <span className="font-display text-[17px] font-semibold text-foreground">{periodTitle(period, today)}</span>
            {period.kind === "day" ? null : <span className="readout tabular ml-2">{rangeLabel(period.from, period.to, today)}</span>}
          </p>
          <Tip
            label={canNext ? `Next: ${periodTitle(next, today)}` : "Nothing after today"}
            render={
              <button
                type="button"
                disabled={!canNext}
                onClick={() => {
                  step(next);
                }}
                className={buttonClass("ghost", "circle-sm", "size-8")}
              >
                <ChevronRight aria-hidden className="size-4" />
                <span className="sr-only">Next {period.kind}</span>
              </button>
            }
          />
          {!isCurrent(period, today) ? (
            <button
              type="button"
              onClick={() => {
                step(periodAt(period.kind === "custom" ? "month" : period.kind, today));
              }}
              className={buttonClass("ghost", "pill-sm", "ml-1")}
            >
              Back to {period.kind === "day" ? "today" : `this ${period.kind}`}
            </button>
          ) : null}
        </div>
      )}
      {currencies.length > 1 ? (
        <div className="ml-auto w-52">
          <Select
            items={options}
            value={chart}
            onValueChange={(v) => {
              if (v) onChart(v);
            }}
          >
            <SelectTrigger aria-label="Currency for charts and breakdowns" className="h-10 pl-3">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
}

/**
 * One totals tile. Narrow (a phone): a short row, label and change left,
 * figure right, so the entries start on the first screen. The period note is
 * dropped there; the period bar above already says it.
 */
function Stat({ label, note, value, children }: { label: string; note: string; value: Converted; children: React.ReactNode }) {
  return (
    <div className="bento grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 @4xl:flex @4xl:flex-col @4xl:items-stretch @4xl:gap-3 @4xl:p-5">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h3 className="readout">{label}</h3>
        <span className="readout tabular hidden truncate @4xl:inline">{note}</span>
      </div>
      <ConvertedStack
        roll
        value={value}
        className="col-start-2 row-span-2 row-start-1 items-end text-right font-display text-[22px] leading-none font-semibold tracking-[-0.01em] text-foreground @4xl:items-start @4xl:text-left @4xl:text-[min(30px,2.6cqi)]"
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** The phone's one-thumb add: a bottom sheet from a button above the tab bar. */
function AddSheet({ payload, today, open, setOpen }: { payload: MoneyPayload; today: Day; open: boolean; setOpen: (open: boolean) => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        className={buttonClass(
          "inverse",
          "pill",
          "fixed right-4 bottom-[calc(76px+1rem)] z-20 h-14 px-6 shadow-lift @4xl:hidden md:bottom-[calc(76px+1.25rem)]",
        )}
      >
        <Plus aria-hidden />
        Add
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-background/40 backdrop-blur-[2px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          className={cn(
            "glass-window fixed inset-x-2 bottom-2 z-50 flex max-h-[calc(var(--app-h)-1rem)] flex-col overflow-y-auto overscroll-contain rounded-card p-5 shadow-lift outline-none",
            "transition-[opacity,translate] duration-200 ease-out-quint data-ending-style:translate-y-6 data-ending-style:opacity-0 data-starting-style:translate-y-6 data-starting-style:opacity-0 motion-reduce:translate-y-0",
          )}
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <Dialog.Title className="font-display text-[17px] leading-tight text-foreground">Add</Dialog.Title>
            <Dialog.Close aria-label="Close" className={buttonClass("ghost", "circle-sm", "size-8")}>
              <X aria-hidden />
            </Dialog.Close>
          </div>
          <TxnForm
            payload={payload}
            today={today}
            variant="sheet"
            autoFocus
            onSaved={() => {
              setOpen(false);
            }}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Edit one txn in Shadow Garden's grow dialog: it grows out of the row's pencil and shrinks back into it. Delete here is undoable too. */
function EditDialog({ payload, today, editing, close }: { payload: MoneyPayload; today: Day; editing: Editing | null; close: () => void }) {
  const api = useMoneyApi();
  // Keep the last txn (and its origin) while the dialog shrinks away.
  const [shown, setShown] = React.useState(editing);
  if (editing && editing !== shown) setShown(editing);
  return (
    <GrowDialog
      open={editing !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title="Edit"
      originRect={shown?.origin ?? null}
      initialFocus="input[inputmode=decimal]"
    >
      {shown ? (
        <>
          <TxnForm key={shown.txn.id} payload={payload} today={today} variant="inline" initial={shown.txn} onSaved={close} />
          <button
            type="button"
            onClick={() => {
              api.remove(shown.txn);
              close();
            }}
            className={buttonClass("ghost", "pill-sm", "mt-3 self-start text-destructive hover:text-destructive")}
          >
            <Trash2 aria-hidden />
            Delete
          </button>
        </>
      ) : null}
    </GrowDialog>
  );
}
