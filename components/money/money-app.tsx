"use client";

import * as React from "react";
import { Dialog } from "@base-ui/react/dialog";
import { ChevronLeft, ChevronRight, Plus, Trash2, X } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/calendar";
import { GrowDialog } from "@/components/ui/grow-dialog";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tip } from "@/components/ui/tooltip";
import { sumByCurrency, type Currency, type Money } from "@/lib/money/currency";
import { addDays, type Day } from "@/lib/money/dates";
import { byId, totals, TXN_LIST_LIMIT, type MoneyPayload } from "@/lib/money/money";
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
import { breakdown, bucketTotals, cumulative, currenciesIn, dailyTotals, type GroupBy, type Side } from "@/lib/money/reports";
import { cn } from "@/lib/utils";
import { AccountsCard } from "./accounts";
import { Breakdown, type ListFilter } from "./breakdown";
import { Delta } from "./charts/chart-kit";
import { PaceLine } from "./charts/pace-line";
import { SpendBars } from "./charts/spend-bars";
import { SpendHeatmap } from "./charts/spend-heatmap";
import { MoneyStack } from "./money-text";
import { TxnForm } from "./txn-form";
import { TxnList, type Editing } from "./txn-list";
import { useLedger, useMoney, useMoneyApi, useToday } from "./use-money";
import { usePeriod } from "./use-period";

// Money (FRD 6.3): a period (day, week, month or custom, in `?p=`) set
// against the one before it, with totals, charts, the period's entries and
// the accounts. Paints from the cache at once; the page's Prefetch refreshes
// it (SPEC V24). Every figure is one currency's integers (V25); periods are
// calendar days in the owner's zone (V27).

export function MoneyApp() {
  const { data, failed, refetch } = useMoney();
  if (!data) {
    if (failed) {
      return (
        <div role="alert" className="bento flex flex-col items-start gap-3 p-5">
          <p className="text-[14px] text-foreground">Money could not load.</p>
          <p className="text-[13px] text-ink-2">The server didn&apos;t answer. Nothing is shown rather than old or sample figures.</p>
          <button type="button" onClick={() => void refetch()} className={buttonClass("surface", "pill-sm")}>
            Try again
          </button>
        </div>
      );
    }
    return <MoneySkeleton />;
  }
  return <MoneyView payload={data} />;
}

function MoneySkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy aria-label="Loading money">
      <div className="h-10 w-80 max-w-full rounded-pill bg-card-nested" />
      <div className="grid grid-cols-1 gap-4 @xl:grid-cols-3">
        <div className="h-[132px] rounded-card bg-card-nested" />
        <div className="h-[132px] rounded-card bg-card-nested" />
        <div className="h-[132px] rounded-card bg-card-nested" />
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

function MoneyView({ payload }: { payload: MoneyPayload }) {
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

  const currencies = currenciesIn(txns, categories, { from: previous.from, to: period.to }, base);
  const [picked, setPicked] = React.useState<Currency | null>(null);
  const currency = picked && currencies.includes(picked) ? picked : (currencies[0] ?? base);

  const cur = totals(txns, categories, period.from, period.to);
  const was = totals(txns, categories, compare.from, compare.to);
  const baseFirst = (xs: readonly Money[]) => [...xs].sort((a, b) => Number(b.currency === currency) - Number(a.currency === currency));
  const minorIn = (xs: readonly Money[]) => xs.find((m) => m.currency === currency)?.minor ?? 0;
  const net = sumByCurrency([...cur.income, ...cur.spend.map((m) => ({ ...m, minor: -m.minor }))]);
  const compareTitle = periodTitle(compare, today);
  const against = period.kind === "day" ? `vs ${compareTitle === "Yesterday" ? "yesterday" : compareTitle}` : `vs ${rangeLabel(compare.from, compare.to, today)}`;

  const [by, setBy] = React.useState<GroupBy>("category");
  const [side, setSide] = React.useState<Side>("spend");
  const [filter, setFilter] = React.useState<ListFilter | null>(null);
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);

  const rows = React.useMemo(
    () => breakdown({ txns, categories, range: period, prev: compare, currency, side, by }),
    [txns, categories, period, compare.from, compare.to, currency, side, by], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const periodTxns = React.useMemo(() => txns.filter((t) => t.postedOn >= period.from && t.postedOn <= period.to), [txns, period]);

  const size = bucketSizeOf(period);
  /** The bucket size when the period has charts: more than one day, and not all in the future. */
  const charts = size !== null && period.from <= today ? size : null;
  const daily = React.useMemo(() => dailyTotals(txns, categories, period, currency, "spend"), [txns, categories, period, currency]);
  const prevDaily = React.useMemo(() => dailyTotals(txns, categories, previous, currency, "spend"), [txns, categories, previous.from, previous.to, currency]); // eslint-disable-line react-hooks/exhaustive-deps
  const dim = ledger.loadingOlder;
  const zero = { minor: 0, currency };
  const stale = payload.source === "load-failed";

  const changePeriod = (p: Period) => {
    setFilter(null);
    setPeriod(p);
  };

  return (
    <div className="flex flex-col gap-6">
      <PeriodBar period={period} onChange={changePeriod} today={today} currencies={currencies} currency={currency} onCurrency={setPicked} />

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

      <section aria-label="Totals" className="grid grid-cols-1 gap-4 @xl:grid-cols-3">
        <Stat label="Spent" note={rangeLabel(period.from, period.to, today)} values={baseFirst(cur.spend)} zero={zero}>
          <Delta cur={minorIn(cur.spend)} prev={minorIn(was.spend)} goodWhenUp={false} against={against} />
        </Stat>
        <Stat label="Received" note={rangeLabel(period.from, period.to, today)} values={baseFirst(cur.income)} zero={zero}>
          <Delta cur={minorIn(cur.income)} prev={minorIn(was.income)} goodWhenUp against={against} />
        </Stat>
        <Stat label="Net" note={cur.count === 1 ? "1 entry" : `${String(cur.count)} entries`} values={baseFirst(net)} zero={zero}>
          <span className="text-[12px] text-ink-2">Received minus spent</span>
        </Stat>
      </section>

      <div className="grid grid-cols-1 items-start gap-6 @4xl:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
        <div className="@container/main flex min-w-0 flex-col gap-4">
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
              />
            </div>
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
              picked={filter}
              onPick={setFilter}
            />
          </div>

          <section aria-labelledby="money-entries" className="mt-2 flex min-w-0 flex-col gap-3">
            <h2 id="money-entries" className="font-display text-[17px] leading-tight text-foreground">
              Entries · {periodTitle(period, today)}
            </h2>
            <TxnList
              txns={periodTxns}
              today={today}
              categories={categories}
              accounts={accounts}
              filter={filter}
              onClearFilter={() => {
                setFilter(null);
              }}
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
        </div>

        <aside aria-label="Add and accounts" className="flex min-w-0 flex-col gap-6">
          <section aria-label="Add a transaction" className="bento hidden p-5 @4xl:block">
            <h2 className="mb-4 font-display text-[17px] leading-tight text-foreground">Add</h2>
            <TxnForm payload={payload} today={today} variant="inline" />
          </section>
          <AccountsCard payload={payload} />
        </aside>
      </div>

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
  currency,
  onCurrency,
}: {
  period: Period;
  onChange: (p: Period) => void;
  today: Day;
  currencies: readonly Currency[];
  currency: Currency;
  onCurrency: (c: Currency) => void;
}) {
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
      {period.kind === "custom" ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-44">
            <DatePicker
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
        <div className="ml-auto w-40">
          <Select
            items={currencies.map((c) => ({ value: c, label: `Charts in ${c}` }))}
            value={currency}
            onValueChange={(v) => {
              if (v) onCurrency(v);
            }}
          >
            <SelectTrigger aria-label="Currency for charts and totals" className="h-10 pl-3">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {currencies.map((c) => (
                <SelectItem key={c} value={c}>
                  Charts in {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, note, values, zero, children }: { label: string; note: string; values: readonly Money[]; zero: Money; children: React.ReactNode }) {
  return (
    <div className="bento flex min-w-0 flex-col gap-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="readout">{label}</h3>
        <span className="readout tabular truncate">{note}</span>
      </div>
      <MoneyStack roll values={values} fallback={zero} className="font-display text-[30px] leading-none font-semibold tracking-[-0.01em] text-foreground" />
      {children}
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
            "glass-window fixed inset-x-2 bottom-2 z-50 flex max-h-[calc(100svh-1rem)] flex-col overflow-y-auto overscroll-contain rounded-card p-5 shadow-lift outline-none",
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
