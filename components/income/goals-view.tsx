"use client";

import * as React from "react";
import { CircleCheck, CircleDashed, Plus, Trash2, TriangleAlert, type LucideIcon } from "lucide-react";
import { FIELD, LABEL } from "@/components/money/form-kit";
import { MoneyText } from "@/components/money/money-text";
import { useFx, useLedger, useMoney, useToday } from "@/components/money/use-money";
import { EmptyState } from "@/components/shell/page-frame";
import { buttonClass } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/calendar";
import { GrowDialog } from "@/components/ui/grow-dialog";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { convertedNet, convertedTotals } from "@/lib/money/converted";
import { CURRENCY_CODES, exponentOf, formatMoney, parseAmount, toInputString, type Currency } from "@/lib/money/currency";
import { addDays, addMonths, DEFAULT_TIME_ZONE, endOfMonth, shortDayLabel, type Day } from "@/lib/money/dates";
import { byId, type MoneyPayload } from "@/lib/money/money";
import { cashIn } from "@/lib/money/net";
import { goalProgress, PROJECTION_DAYS, sortGoals, type Goal, type GoalKind, type GoalProgress, type GoalStatus } from "@/lib/saas/goals";
import { inProduct, toFacts, type IncomePayload, type IncomeProduct } from "@/lib/saas/income";
import { mrrAt } from "@/lib/saas/mrr";
import { cn } from "@/lib/utils";
import { Notice } from "./parts";
import { useIncome, useIncomeNow } from "./use-income";
import { useGoalApi, useVisibleGoals } from "./use-goals";

// Goals (FR-INCOME-10, T43): "MRR $5k by June" tracks MRR in the goal's
// currency; "save ₦2m" tracks cash in open accounts, converted (V26). The
// projection is a straight line through the last 90 days to the due date:
// on track, or behind by how much.

const STATUS: Record<GoalStatus, { label: string; icon: LucideIcon; ink: string }> = {
  reached: { label: "Reached", icon: CircleCheck, ink: "text-ok" },
  "on-track": { label: "On track", icon: CircleCheck, ink: "text-ok" },
  behind: { label: "Behind", icon: TriangleAlert, ink: "text-warn" },
  missed: { label: "Missed", icon: TriangleAlert, ink: "text-warn" },
  open: { label: "No due date", icon: CircleDashed, ink: "text-ink-2" },
};

export function GoalsView() {
  const { data } = useIncome();
  if (!data) {
    return (
      <div className="flex flex-col gap-3" aria-busy aria-label="Loading goals">
        <div className="h-9 w-32 self-end rounded-pill bg-card-nested" />
        <div className="h-[132px] rounded-card bg-card-nested" />
        <div className="h-[132px] rounded-card bg-card-nested" />
      </div>
    );
  }
  return <Goals payload={data} />;
}

interface Editing {
  goal: Goal | null;
  origin: DOMRect;
}

interface Cash {
  now: number;
  past: number;
}

/**
 * Cash now and 90 days ago in each currency asked for, from the money cache;
 * null until it's on the device. The ledger and the rates are read once.
 */
function useCash(money: MoneyPayload | null, currencies: readonly Currency[]) {
  const today = useToday(money?.timeZone ?? DEFAULT_TIME_ZONE);
  const since = addDays(today, -PROJECTION_DAYS);
  const ledger = useLedger(money ?? EMPTY_MONEY, since, today);
  const fx = useFx(since, { enabled: money !== null && currencies.length > 0 });
  const categories = React.useMemo(() => byId(money?.categories ?? []), [money?.categories]);
  const key = currencies.join(",");
  return React.useMemo(() => {
    if (!money) return null;
    let missing = false;
    const by = new Map<Currency, Cash>();
    for (const currency of key ? (key.split(",") as Currency[]) : []) {
      const cash = cashIn(money.accounts, money.priorMinor, money.txns, money.since, currency, fx.table, today);
      // Cash 90 days ago = now − what was saved since (income − spending), in the goal's currency.
      const saved = convertedNet(convertedTotals(ledger.txns, categories, addDays(since, 1), today, currency, fx.table));
      if (cash.missing.length + saved.missing.length > 0) missing = true;
      by.set(currency, { now: cash.total.minor, past: cash.total.minor - saved.total.minor });
    }
    return { by, missing, loading: ledger.loadingOlder || fx.loading };
  }, [money, key, fx.table, fx.loading, today, ledger.txns, ledger.loadingOlder, categories, since]);
}

const EMPTY_MONEY: MoneyPayload = {
  source: "load-failed",
  baseCurrency: "NGN",
  timeZone: DEFAULT_TIME_ZONE,
  since: "1970-01-01",
  accounts: [],
  categories: [],
  txns: [],
  priorMinor: {},
  subscriptions: [],
  budgets: [],
  rules: [],
};

function Goals({ payload }: { payload: IncomePayload }) {
  const api = useGoalApi();
  const now = useIncomeNow();
  const money = useMoney().data;
  const today = useToday(money?.timeZone ?? DEFAULT_TIME_ZONE);
  const goals = sortGoals(useVisibleGoals(payload.goals));
  const products = React.useMemo(() => new Map(payload.products.map((p) => [p.id, p])), [payload.products]);
  const { facts } = React.useMemo(() => toFacts(payload.movements), [payload.movements]);
  const saveCurrencies = [...new Set(goals.filter((g) => g.kind === "save").map((g) => g.currency))].sort();
  const cash = useCash(money, saveCurrencies);
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const [shown, setShown] = React.useState(editing);
  if (editing && editing !== shown) setShown(editing);
  const open = (goal: Goal | null) => (e: React.MouseEvent<HTMLElement>) => {
    setEditing({ goal, origin: e.currentTarget.getBoundingClientRect() });
  };

  const progressOf = (g: Goal): GoalProgress | null => {
    if (g.kind === "mrr") {
      const scoped = inProduct(facts, g.productId).filter((f) => f.currency === g.currency);
      return goalProgress(g, mrrAt(scoped, now).mrr, mrrAt(scoped, new Date(now.getTime() - PROJECTION_DAYS * 86_400_000)).mrr, today);
    }
    const c = cash?.by.get(g.currency);
    return c ? goalProgress(g, c.now, c.past, today) : null;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[13px] text-ink-2">
          Projections draw a straight line through the last 90 days to the due date. A savings goal&apos;s pace comes from income less spending, so money moved to an account you don&apos;t track here, or exchange-rate swings, can make it read high or low.
        </p>
        <button type="button" onClick={open(null)} className={buttonClass("inverse", "pill-sm")}>
          <Plus aria-hidden />
          New goal
        </button>
      </div>
      {cash?.missing ? <Notice>Some balances have no rate yet, so cash leaves them out.</Notice> : null}

      {goals.length === 0 ? (
        <div className="bento p-5">
          <EmptyState title="No goals yet" body={'Set a target such as "MRR $5k by June" or "save ₦2m by December", and see whether you\'re on track.'} />
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
          {goals.map((g) => (
            <GoalCard key={g.id} goal={g} progress={progressOf(g)} product={g.productId ? products.get(g.productId) : undefined} dim={g.kind === "save" && (cash?.loading ?? true)} onEdit={open(g)} />
          ))}
        </ul>
      )}

      <GrowDialog
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        title={shown?.goal ? "Edit goal" : "New goal"}
        originRect={shown?.origin ?? null}
        initialFocus="input[inputmode=decimal]"
      >
        {shown ? (
          <GoalForm
            key={shown.goal?.id ?? "new"}
            initial={shown.goal}
            products={payload.products.filter((p) => !p.archived || p.id === shown.goal?.productId)}
            baseCurrency={money?.baseCurrency ?? "USD"}
            today={today}
            onDone={(g) => {
              api.save(g);
              setEditing(null);
            }}
            onDelete={(g) => {
              api.remove(g);
              setEditing(null);
            }}
          />
        ) : null}
      </GrowDialog>
    </div>
  );
}

function GoalCard({ goal, progress, product, dim, onEdit }: { goal: Goal; progress: GoalProgress | null; product: IncomeProduct | undefined; dim: boolean; onEdit: (e: React.MouseEvent<HTMLElement>) => void }) {
  const money = (minor: number) => <MoneyText value={{ minor, currency: goal.currency }} />;
  const meta = progress ? STATUS[progress.status] : null;
  const Icon = meta?.icon;
  const what = goal.kind === "mrr" ? `MRR · ${product?.name ?? (goal.productId ? "A removed product" : "Every product")}` : "Savings · cash in open accounts";
  return (
    <li>
      <button
        type="button"
        onClick={onEdit}
        className={cn("bento flex w-full flex-col gap-3 p-5 text-left outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring", dim && "opacity-60")}
      >
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="readout block truncate">{what}</span>
            <span className="mt-1 block truncate text-[15px] font-medium text-foreground">{goal.title || (goal.kind === "mrr" ? "MRR goal" : "Savings goal")}</span>
          </span>
          {meta && Icon ? (
            <span className={cn("inline-flex shrink-0 items-center gap-1 text-[12px] font-medium", meta.ink)}>
              <Icon aria-hidden className="size-3.5" strokeWidth={2} />
              {meta.label}
            </span>
          ) : null}
        </span>
        <span className="flex items-baseline justify-between gap-3 text-[13px] text-ink-2">
          <span className="font-display text-[22px] leading-none font-semibold text-foreground">{progress ? money(progress.current) : "…"}</span>
          <span className="tabular">of {money(goal.targetMinor)}</span>
        </span>
        <span
          role="progressbar"
          aria-label={`${goal.title || "Goal"} progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round((progress?.share ?? 0) * 100)}
          className="block h-1.5 overflow-hidden rounded-full bg-signal-soft"
        >
          <span className="block h-full rounded-full bg-signal transition-[width] duration-300" style={{ width: `${String((progress?.share ?? 0) * 100)}%` }} />
        </span>
        <span className="tabular text-[12.5px] text-ink-2">{progress ? describe(goal, progress, money) : "Waiting for your accounts to load."}</span>
      </button>
    </li>
  );
}

function describe(goal: Goal, p: GoalProgress, money: (minor: number) => React.ReactNode): React.ReactNode {
  const due = goal.dueOn ? shortDayLabel(goal.dueOn) : null;
  switch (p.status) {
    case "reached":
      return "Target reached.";
    case "open":
      return "No due date, so no projection.";
    case "missed":
      return (
        <>
          Due {due}; short by {money(p.shortBy ?? 0)}.
        </>
      );
    case "on-track":
      return (
        <>
          At this pace, {money(p.projected ?? 0)} by {due}.
        </>
      );
    case "behind":
      return (
        <>
          At this pace, {money(p.projected ?? 0)} by {due}: behind by {money(p.shortBy ?? 0)}.
        </>
      );
  }
}

const KIND_OPTIONS: readonly { value: GoalKind; label: string }[] = [
  { value: "mrr", label: "MRR" },
  { value: "save", label: "Savings" },
];

const ALL = "all";
/** The clock, read in the submit handler (kept out of render for react-hooks/purity). */
const stamp = () => Date.now();

function GoalForm({
  initial,
  products,
  baseCurrency,
  today,
  onDone,
  onDelete,
}: {
  initial: Goal | null;
  products: readonly IncomeProduct[];
  baseCurrency: Currency;
  today: Day;
  onDone: (g: Goal) => void;
  onDelete: (g: Goal) => void;
}) {
  const id = React.useId();
  const [kind, setKind] = React.useState<GoalKind>(initial?.kind ?? (products.length > 0 ? "mrr" : "save"));
  const [title, setTitle] = React.useState(initial?.title ?? "");
  const [productId, setProductId] = React.useState<string>(initial?.productId ?? ALL);
  const [currency, setCurrency] = React.useState<Currency>(initial?.currency ?? (kind === "mrr" ? "USD" : baseCurrency));
  const [amount, setAmount] = React.useState(initial ? toInputString(initial.targetMinor, initial.currency) : "");
  const [dueOn, setDueOn] = React.useState<Day>(initial?.dueOn ?? endOfMonth(addMonths(today, 6)));
  const [tried, setTried] = React.useState(false);

  const minor = parseAmount(amount, currency);
  const amountError = amount.trim() === "" ? "Enter the target" : minor === null || minor <= 0 ? `Not an amount${exponentOf(currency) === 0 ? " (no decimals in this currency)" : ""}` : null;
  const dueError = dueOn <= today ? "Pick a day after today" : null;
  const productItems = [{ value: ALL, label: "Every product" }, ...products.map((p) => ({ value: p.id, label: p.name }))];

  const submit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    setTried(true);
    if (amountError || minor === null || (dueError && dueOn !== initial?.dueOn)) return;
    onDone({
      id: initial?.id ?? crypto.randomUUID(),
      kind,
      title: title.trim(),
      productId: kind === "mrr" && productId !== ALL ? productId : null,
      targetMinor: minor,
      currency,
      dueOn,
      createdAt: initial?.createdAt ?? stamp(),
    });
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Segmented
        label="Goal kind"
        value={kind}
        options={KIND_OPTIONS}
        onChange={(k) => {
          setKind(k);
          if (!initial) setCurrency(k === "mrr" ? "USD" : baseCurrency);
        }}
      />
      <div>
        <label htmlFor={`${id}-title`} className={LABEL}>
          Name
        </label>
        <input
          id={`${id}-title`}
          value={title}
          maxLength={80}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
          placeholder={kind === "mrr" ? "MRR $5k" : "Emergency fund"}
          className={FIELD}
        />
      </div>
      {kind === "mrr" ? (
        <div>
          <label htmlFor={`${id}-product`} className={LABEL}>
            Product
          </label>
          <Select
            items={productItems}
            value={productId}
            onValueChange={(v) => {
              if (v) setProductId(v);
            }}
          >
            <SelectTrigger id={`${id}-product`} className="h-10 pl-3">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {productItems.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className="grid grid-cols-[minmax(0,1fr)_104px] gap-3">
        <div>
          <label htmlFor={`${id}-amount`} className={LABEL}>
            {kind === "mrr" ? "Target MRR" : "Target savings"}
          </label>
          <input
            id={`${id}-amount`}
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
            }}
            placeholder={kind === "mrr" ? "5000" : "2000000"}
            aria-invalid={tried && amountError !== null}
            aria-describedby={`${id}-amount-note`}
            className={cn(FIELD, "tabular h-12 text-[20px] font-semibold")}
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
        <p id={`${id}-amount-note`} className="tabular col-span-2 -mt-2 min-h-[18px] text-[12px] text-ink-2" aria-live="polite">
          {tried && amountError ? (
            <span className="text-destructive">{amountError}</span>
          ) : minor ? (
            kind === "mrr" ? (
              `${formatMoney({ minor, currency })} MRR. Only MRR in ${currency} counts.`
            ) : (
              `${formatMoney({ minor, currency })} in open accounts, other currencies converted.`
            )
          ) : null}
        </p>
      </div>
      <div>
        <label htmlFor={`${id}-due`} className={LABEL}>
          By
        </label>
        <DatePicker id={`${id}-due`} className="h-10" value={dueOn} onChange={setDueOn} today={today} min={addDays(today, 1)} />
        {tried && dueError && dueOn !== initial?.dueOn ? <p className="mt-1 text-[12px] text-destructive">{dueError}</p> : null}
      </div>
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
          {initial ? "Save" : "Add goal"}
        </button>
      </div>
    </form>
  );
}

