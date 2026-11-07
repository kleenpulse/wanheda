"use client";

import * as React from "react";
import { Pencil, Plus, Target, Trash2 } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { GrowDialog } from "@/components/ui/grow-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shell/page-frame";
import { budgetName, budgetProgress, sortBudgets, type Budget, type BudgetProgress } from "@/lib/money/budgets";
import { CURRENCY_CODES, exponentOf, formatMoney, type Currency } from "@/lib/money/currency";
import { daysBetween, endOfMonth, monthLabel, todayIn, type Day } from "@/lib/money/dates";
import { byId, type Category, type MoneyPayload } from "@/lib/money/money";
import { cn } from "@/lib/utils";
import { LABEL } from "./form-kit";
import { MoneyLoadFailed } from "./money-app";
import { MoneyInput, MoneyNote, useMoneyField } from "./money-input";
import { CategoryMark, MoneyText } from "./money-text";
import { grouped } from "./txn-form";
import { useBudgetApi, useFx, useMoney, useToday, windowFxFrom } from "./use-money";

// Budgets (FR-MONEY-7): this month's spend against each budget, overall
// first. Paints from the money cache at once (V24); FX rates come in their own
// cache, and until they do, spend in other currencies shows apart (V26).
// Alerts at 80 % and 100 % are raised by the server on each save (V31).

export function BudgetsApp() {
  const { data, failed, refetch } = useMoney();
  if (!data) {
    if (failed) return <MoneyLoadFailed onRetry={() => void refetch()} />;
    return (
      <div className="flex flex-col gap-3" aria-busy aria-label="Loading budgets">
        <div className="h-10 w-72 max-w-full rounded-pill bg-card-nested" />
        <div className="h-[132px] rounded-card bg-card-nested" />
        <div className="h-[260px] rounded-card bg-card-nested" />
      </div>
    );
  }
  return <BudgetsView payload={data} />;
}

interface Editing {
  budget: Budget | null;
  origin: DOMRect | null;
}

/** When a budget was made: outside render, like `newTxn`. */
const stamp = () => Date.now();

/** The tone a level takes: the signal while on track, warn from 80 %, destructive past 100 %. */
const TONE = {
  0: { track: "bg-signal-soft", fill: "bg-signal", text: "text-ink-2" },
  80: { track: "bg-warn/15", fill: "bg-warn", text: "text-warn" },
  100: { track: "bg-destructive/15", fill: "bg-destructive", text: "text-destructive" },
} as const;

function BudgetsView({ payload }: { payload: MoneyPayload }) {
  const today = useToday(payload.timeZone);
  const api = useBudgetApi();
  const categories = React.useMemo(() => byId(payload.categories), [payload.categories]);
  const fx = useFx(windowFxFrom(payload)).table;
  const budgets = React.useMemo(() => sortBudgets(payload.budgets ?? [], categories), [payload.budgets, categories]);
  const progress = React.useMemo(
    // This month and the one before (rollover) are both inside the window, pending writes laid over.
    () => budgets.map((b) => budgetProgress(b, payload.txns, categories, today, todayIn(payload.timeZone, new Date(b.createdAt)), fx)),
    [budgets, payload.txns, categories, today, payload.timeZone, fx],
  );
  const left = daysBetween(today, endOfMonth(today));
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const [shown, setShown] = React.useState(editing);
  if (editing && editing !== shown) setShown(editing);

  const open = (budget: Budget | null) => (e: React.MouseEvent<HTMLElement>) => {
    setEditing({ budget, origin: e.currentTarget.getBoundingClientRect() });
  };
  const taken = new Set(budgets.map((b) => b.categoryId ?? ""));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-[17px] leading-tight text-foreground">
          {monthLabel(today)}
          <span className="readout tabular ml-2">{left === 0 ? "Last day" : left === 1 ? "1 day left" : `${String(left)} days left`}</span>
        </h2>
        <button type="button" onClick={open(null)} className={buttonClass("inverse", "pill-sm")}>
          <Plus aria-hidden />
          New budget
        </button>
      </div>

      {progress.length === 0 ? (
        <div className="bento p-5">
          <EmptyState
            title="No budgets yet"
            body="Set one for the whole month, or for a category. You get a notice at 80 % and at 100 %, on every device."
          />
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {progress.map((p) => (
            <BudgetRow key={p.budget.id} p={p} categories={categories} onEdit={open(p.budget)} />
          ))}
        </ul>
      )}

      <GrowDialog
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        title={shown?.budget ? "Edit budget" : "New budget"}
        originRect={shown?.origin ?? null}
        initialFocus="input[inputmode=decimal]"
      >
        {shown ? (
          <BudgetForm
            key={shown.budget?.id ?? "new"}
            payload={payload}
            initial={shown.budget}
            taken={taken}
            onDone={(b) => {
              api.save(b);
              setEditing(null);
            }}
            onDelete={(b) => {
              api.remove(b, budgetName(b, categories));
              setEditing(null);
            }}
          />
        ) : null}
      </GrowDialog>
    </div>
  );
}

function BudgetRow({ p, categories, onEdit }: { p: BudgetProgress; categories: ReadonlyMap<string, Category>; onEdit: (e: React.MouseEvent<HTMLElement>) => void }) {
  const { budget, limit, spent, carry, missing, level } = p;
  const category = budget.categoryId ? (categories.get(budget.categoryId) ?? null) : null;
  const name = budgetName(budget, categories);
  const tone = TONE[level];
  const rest = { minor: limit.minor - spent.minor, currency: limit.currency };
  const pct = Number.isFinite(p.share) ? Math.round(p.share * 100) : null;
  return (
    <li className="bento flex flex-col gap-3 p-4 @xl:p-5">
      <div className="flex items-center gap-3">
        {category ? (
          <CategoryMark category={category} />
        ) : (
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-signal-soft text-signal">
            <Target className="size-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-medium text-foreground">{name}</p>
          <p className="tabular truncate text-[12.5px] text-ink-2">
            <MoneyText value={spent} /> of <MoneyText value={limit} />
            {budget.rollover ? <span className="text-ink-3"> · rolls over</span> : null}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className={cn("tabular text-[14px] font-semibold", tone.text)}>
            {rest.minor >= 0 ? (
              <>
                <MoneyText value={rest} /> left
              </>
            ) : (
              <>
                <MoneyText value={{ ...rest, minor: -rest.minor }} /> over
              </>
            )}
          </p>
          <p className="tabular text-[12px] text-ink-3">
            {pct === null ? (
              "No budget left"
            ) : (
              <>
                <span className="font-figure">{pct}%</span> used
              </>
            )}
          </p>
        </div>
        <button type="button" onClick={onEdit} aria-label={`Edit the ${name} budget`} className={buttonClass("ghost", "circle-sm", "size-8 shrink-0")}>
          <Pencil aria-hidden />
        </button>
      </div>
      <div
        role="progressbar"
        aria-label={`${name} budget used`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, pct ?? 100)}
        aria-valuetext={pct === null ? "Over budget" : `${String(pct)} %`}
        className={cn("h-2 overflow-hidden rounded-full", tone.track)}
      >
        <div className={cn("h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none", tone.fill)} style={{ width: `${String(Math.min(100, (Number.isFinite(p.share) ? p.share : 1) * 100))}%` }} />
      </div>
      {carry || missing.length > 0 ? (
        <p className="text-[12px] text-ink-2">
          {carry ? (
            <>
              {carry.minor >= 0 ? "Includes " : "Less "}
              <MoneyText value={{ ...carry, minor: Math.abs(carry.minor) }} /> {carry.minor >= 0 ? "left over from" : "overspent in"} last month.{" "}
            </>
          ) : null}
          {missing.length > 0 ? (
            <>
              Not counted yet, no rate:{" "}
              {missing.map((m, i) => (
                <span key={m.currency}>
                  {i > 0 ? ", " : ""}
                  <MoneyText value={m} />
                </span>
              ))}
              .
            </>
          ) : null}
        </p>
      ) : null}
    </li>
  );
}

const OVERALL = "overall";

function BudgetForm({
  payload,
  initial,
  taken,
  onDone,
  onDelete,
}: {
  payload: MoneyPayload;
  initial: Budget | null;
  /** Category ids (and "" for overall) that already have a budget. */
  taken: ReadonlySet<string>;
  onDone: (b: Budget) => void;
  onDelete: (b: Budget) => void;
}) {
  const id = React.useId();
  const free = (key: string) => !taken.has(key) || (initial !== null && (initial.categoryId ?? "") === key);
  const options = grouped(payload.categories, "expense");
  const firstFree = free("") ? OVERALL : (options.find((o) => free(o.c.id))?.c.id ?? OVERALL);
  const [target, setTarget] = React.useState<string>(initial ? (initial.categoryId ?? OVERALL) : firstFree);
  const [currency, setCurrency] = React.useState<Currency>(initial?.currency ?? payload.baseCurrency);
  const amount = useMoneyField({ initialMinor: initial?.amountMinor ?? null, currency, rule: "positive", emptyMessage: "Enter the monthly amount" });
  const [rollover, setRollover] = React.useState(initial?.rollover ?? false);
  const [tried, setTried] = React.useState(false);

  const minor = amount.minor;
  const amountError = amount.error;
  const targetError = free(target === OVERALL ? "" : target) ? null : "That one already has a budget";
  const items = [{ value: OVERALL, label: "Overall (every category)" }, ...options.map((o) => ({ value: o.c.id, label: `${o.c.emoji} ${o.c.name}` }))];

  const submit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    setTried(true);
    if (amountError || targetError || minor === null) return;
    onDone({
      id: initial?.id ?? crypto.randomUUID(),
      createdAt: initial?.createdAt ?? stamp(),
      categoryId: target === OVERALL ? null : target,
      amountMinor: minor,
      currency,
      rollover,
    });
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div>
        <label htmlFor={`${id}-target`} className={LABEL}>
          For
        </label>
        <Select
          items={items}
          value={target}
          onValueChange={(v) => {
            if (v) setTarget(v);
          }}
        >
          <SelectTrigger id={`${id}-target`} className="h-10 pl-3" aria-invalid={tried && targetError !== null}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={OVERALL} disabled={!free("")}>
              Overall (every category)
            </SelectItem>
            {options.map(({ c, child }) => (
              <SelectItem key={c.id} value={c.id} disabled={!free(c.id)} className={child ? "pl-7" : undefined}>
                {c.emoji} {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {tried && targetError ? <p className="mt-1 text-[12px] text-destructive">{targetError}</p> : null}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_104px] gap-3">
        <div>
          <label htmlFor={`${id}-amount`} className={LABEL}>
            Per month
          </label>
          <MoneyInput
            field={amount}
            invalid={amount.shownError(tried) !== null}
            id={`${id}-amount`}
            placeholder={exponentOf(currency) > 0 ? "150,000 or 150k" : "15,000"}
            aria-describedby={`${id}-amount-note`}
            className="h-12 text-[20px] font-semibold"
          />
        </div>
        <div>
          <label htmlFor={`${id}-currency`} className={LABEL}>
            Currency
          </label>
          <Select
            items={CURRENCY_CODES.map((c) => ({ value: c, label: c }))}
            value={currency}
            onValueChange={(v) => {
              if (v) setCurrency(v);
            }}
          >
            <SelectTrigger id={`${id}-currency`} className="h-12 pl-3">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCY_CODES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <MoneyNote
          id={`${id}-amount-note`}
          field={amount}
          tried={tried}
          className="col-span-2 -mt-2 min-h-[18px]"
          note={minor ? `${formatMoney({ minor, currency })} a month. Spend in other currencies is converted at each day's rate.` : null}
        />
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-[12px] bg-card-nested p-3">
        <input
          type="checkbox"
          checked={rollover}
          onChange={(e) => {
            setRollover(e.target.checked);
          }}
          className="mt-0.5 size-4 shrink-0 accent-signal"
        />
        <span className="min-w-0">
          <span className="block text-[14px] text-foreground">Roll over</span>
          <span className="block text-[12.5px] text-ink-2">What&apos;s left this month is added to next month&apos;s; an overspend is taken off it.</span>
        </span>
      </label>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {initial ? (
          <button
            type="button"
            onClick={() => {
              onDelete(initial);
            }}
            className={buttonClass("ghost", "pill-sm", "text-destructive hover:text-destructive")}
          >
            <Trash2 aria-hidden />
            Delete
          </button>
        ) : (
          <span />
        )}
        <button type="submit" className={buttonClass("inverse", "pill")}>
          {initial ? "Save" : "Add budget"}
        </button>
      </div>
    </form>
  );
}

/** For Home's widget: this month's progress of every budget, overall first. */
export function useBudgetProgress(payload: MoneyPayload | null, today: Day): BudgetProgress[] {
  const fx = useFx(payload ? windowFxFrom(payload) : today, { enabled: payload !== null }).table;
  const categories = React.useMemo(() => byId(payload?.categories ?? []), [payload?.categories]);
  return React.useMemo(() => {
    if (!payload) return [];
    return sortBudgets(payload.budgets ?? [], categories).map((b) => budgetProgress(b, payload.txns, categories, today, todayIn(payload.timeZone, new Date(b.createdAt)), fx));
  }, [payload, categories, today, fx]);
}
