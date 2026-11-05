"use client";

import * as React from "react";
import { CalendarClock, ExternalLink, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/calendar";
import { GrowDialog } from "@/components/ui/grow-dialog";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tip } from "@/components/ui/tooltip";
import { CURRENCY_CODES, exponentOf, formatMoney, parseAmount, toInputString, type Currency } from "@/lib/money/currency";
import { addDays, dayLabel, daysBetween, shortDayLabel, type Day } from "@/lib/money/dates";
import { byId, type Account, type Category, type MoneyPayload } from "@/lib/money/money";
import {
  blankSubscription,
  byMonthlyCost,
  costOf,
  costTotals,
  cycleLabel,
  dueLabel,
  editedAnchor,
  isWebUrl,
  nextOn,
  nextRenewal,
  SUB_INTERVAL_MAX,
  SUB_NAME_MAX,
  SUB_URL_MAX,
  upcoming,
  type SubCycle,
  type SubEvent,
  type SubStatus,
  type Subscription,
} from "@/lib/money/subscriptions";
import { cn } from "@/lib/utils";
import { MoneyLoadFailed } from "./money-app";
import { CategoryMark, MoneyStack, MoneyText } from "./money-text";
import { RenewalCycle } from "./renewal-cycle";
import { grouped } from "./txn-form";
import { useMoney, useNewSubscription, useSubscriptionApi, useToday } from "./use-money";

// Subscriptions (FR-MONEY-8, 9; SPEC T36): what they cost a month and a
// year, what renews next, and the list ranked by monthly cost, so the
// expensive ones are the first to question. Reads the same money cache as
// the other two pages (V24); writes go through the money outbox (V28).
// Figures are one currency's integers, never added across currencies (V26).

const FIELD =
  "h-10 w-full min-w-0 rounded-[12px] bg-sheet px-3 text-[14px] text-foreground ring-1 ring-border outline-none placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-ring dark:bg-card-nested dark:ring-glass-border";
const LABEL = "readout mb-1.5 block";

/** How far ahead the timeline looks. */
const AHEAD_DAYS = 60;

export function SubscriptionsApp() {
  const { data, failed, refetch } = useMoney();
  if (!data) {
    if (failed) return <MoneyLoadFailed onRetry={() => void refetch()} />;
    return (
      <div className="flex flex-col gap-4" aria-busy aria-label="Loading subscriptions">
        <div className="grid grid-cols-1 gap-2.5 @xl:grid-cols-3 @xl:gap-4">
          <div className="h-16 rounded-card bg-card-nested @xl:h-[116px]" />
          <div className="h-16 rounded-card bg-card-nested @xl:h-[116px]" />
          <div className="h-16 rounded-card bg-card-nested @xl:h-[116px]" />
        </div>
        <div className="h-[420px] rounded-card bg-card-nested" />
      </div>
    );
  }
  return <SubscriptionsView payload={data} />;
}

interface Editing {
  sub: Subscription | null;
  origin: DOMRect | null;
}

/** A new one asked for from the palette: no button to grow out of. */
const FROM_PALETTE: Editing = { sub: null, origin: null };

/** When a new subscription was made: outside render, like `newTxn`. */
const stamp = () => Date.now();

function SubscriptionsView({ payload }: { payload: MoneyPayload }) {
  const today = useToday(payload.timeZone);
  const api = useSubscriptionApi();
  const base = payload.baseCurrency;
  const subs = React.useMemo(() => payload.subscriptions ?? [], [payload.subscriptions]);
  const categories = React.useMemo(() => byId(payload.categories), [payload.categories]);
  const accounts = React.useMemo(() => byId(payload.accounts), [payload.accounts]);

  const monthly = costTotals(subs, "month", base);
  const yearly = costTotals(subs, "year", base);
  const ranked = React.useMemo(() => byMonthlyCost(subs, base), [subs, base]);
  const inactive = subs.filter((s) => s.status !== "active");
  const events = React.useMemo(() => upcoming(subs, today, addDays(today, AHEAD_DAYS)), [subs, today]);
  const next = events[0];
  const zero = { minor: 0, currency: base };

  // The palette's "New subscription" asks for the add form, here or after the hop.
  const asked = useNewSubscription((s) => s.asked);
  const clearAsk = useNewSubscription((s) => s.clear);
  const [picked, setPicked] = React.useState<Editing | null>(null);
  const editing = picked ?? (asked ? FROM_PALETTE : null);
  const setEditing = (next: Editing | null) => {
    setPicked(next);
    if (asked) clearAsk();
  };
  const [shown, setShown] = React.useState(editing);
  if (editing && editing !== shown) setShown(editing);
  const [showInactive, setShowInactive] = React.useState(false);

  const open = (sub: Subscription | null) => (e: React.MouseEvent<HTMLElement>) => {
    setEditing({ sub, origin: e.currentTarget.getBoundingClientRect() });
  };

  const row = (s: Subscription) => (
    <SubRow
      key={s.id}
      sub={s}
      today={today}
      category={s.categoryId ? (categories.get(s.categoryId) ?? null) : null}
      account={s.accountId ? accounts.get(s.accountId) : undefined}
      onEdit={open(s)}
      onStatus={(status) => {
        api.setStatus(s, status);
      }}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Totals" className="grid grid-cols-1 gap-2.5 @xl:grid-cols-3 @xl:gap-4">
        <Tile label="Per month" note={`${String(ranked.length)} active`}>
          <MoneyStack roll values={monthly} fallback={zero} className={TILE_FIGURE} />
        </Tile>
        <Tile label="Per year" note="At today's prices">
          <MoneyStack roll values={yearly} fallback={zero} className={TILE_FIGURE} />
        </Tile>
        <Tile label="Next" note={next ? dueLabel(next.on, today) : `Next ${String(AHEAD_DAYS)} days`}>
          {next ? (
            <span className="flex min-w-0 flex-col items-end gap-1 text-right @xl:items-start @xl:text-left">
              <span className="max-w-full truncate font-display text-[22px] leading-none font-semibold tracking-[-0.01em] text-foreground @xl:text-[26px]">
                {next.sub.name}
              </span>
              <span className="tabular text-[12.5px] text-ink-2">
                {next.kind === "trial" ? "Trial ends" : "Renews"} {shortDayLabel(next.on)}
              </span>
            </span>
          ) : (
            <span className="text-right text-[13px] text-ink-2 @xl:text-left">Nothing renews soon</span>
          )}
        </Tile>
      </section>

      <div className="grid grid-cols-1 items-start gap-6 @4xl:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
        <section aria-labelledby="subs-ranked" className="bento flex min-w-0 flex-col gap-3 p-5">
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="subs-ranked" className="font-display text-[17px] leading-tight text-foreground">
                What you pay for
              </h2>
              <p className="mt-1 text-[12.5px] text-ink-2">Most per month first: the top ones are the first to question.</p>
            </div>
            <button type="button" onClick={open(null)} className={buttonClass("surface", "pill-sm", "shrink-0")}>
              <Plus aria-hidden />
              Add
            </button>
          </header>
          {ranked.length === 0 ? (
            <p className="py-2 text-[13px] text-ink-2">
              {subs.length === 0 ? "No subscriptions yet. Add the ones you pay for to see what they cost a month and when they renew." : "None active."}
            </p>
          ) : (
            <ul className="-mx-2.5 flex flex-col">{ranked.map(row)}</ul>
          )}
          {inactive.length > 0 ? (
            <>
              <button
                type="button"
                aria-expanded={showInactive}
                onClick={() => {
                  setShowInactive((v) => !v);
                }}
                className="tabular self-start rounded-pill px-1 text-[12.5px] font-medium text-ink-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {showInactive ? "Hide paused and cancelled" : `Paused and cancelled (${String(inactive.length)})`}
              </button>
              {showInactive ? <ul className="-mx-2.5 flex flex-col">{inactive.map(row)}</ul> : null}
            </>
          ) : null}
        </section>

        <div className="flex min-w-0 flex-col gap-6">
          <RenewalCycle subscriptions={subs} today={today} base={base} />
          <Timeline events={events} today={today} />
        </div>
      </div>

      <GrowDialog
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        title={shown?.sub ? "Edit subscription" : "Add subscription"}
        originRect={shown?.origin ?? null}
        initialFocus="input"
      >
        {shown ? (
          <SubscriptionForm
            key={shown.sub?.id ?? "new"}
            payload={payload}
            today={today}
            initial={shown.sub}
            onDone={(sub) => {
              setEditing(null);
              api.save(sub);
            }}
            onDelete={(sub) => {
              setEditing(null);
              api.remove(sub);
            }}
          />
        ) : null}
      </GrowDialog>
    </div>
  );
}

const TILE_FIGURE =
  "items-end text-right font-display text-[22px] leading-none font-semibold tracking-[-0.01em] text-foreground @xl:items-start @xl:text-left @xl:text-[30px]";

/** One totals tile: a short row on a phone (label left, figure right), a card from @xl. */
function Tile({ label, note, children }: { label: string; note: string; children: React.ReactNode }) {
  return (
    <div className="bento grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 px-4 py-3 @xl:flex @xl:flex-col @xl:items-stretch @xl:gap-3 @xl:p-5">
      <div className="flex min-w-0 flex-col gap-1 @xl:flex-row @xl:items-center @xl:justify-between @xl:gap-3">
        <h3 className="readout">{label}</h3>
        <span className="readout tabular truncate">{note}</span>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function SubRow({
  sub,
  today,
  category,
  account,
  onEdit,
  onStatus,
}: {
  sub: Subscription;
  today: Day;
  category: Category | null;
  account: Account | undefined;
  onEdit: (e: React.MouseEvent<HTMLElement>) => void;
  onStatus: (status: SubStatus) => void;
}) {
  const active = sub.status === "active";
  const next = nextRenewal(sub, today);
  const soon = next !== null && daysBetween(today, next) <= Math.max(sub.remindDays, 1);
  const trial = active && sub.trialEndsOn !== null && sub.trialEndsOn >= today;
  const notMonthly = !(sub.cycle === "month" && sub.intervalCount === 1);
  const details = [
    cycleLabel(sub),
    active && next ? (soon ? dueLabel(next, today) : `Next ${shortDayLabel(next)}`) : sub.status === "paused" ? "Paused" : "Cancelled",
    account?.name,
  ].filter(Boolean);

  return (
    <li className="flex min-h-14 items-center gap-3 rounded-[14px] px-2.5 py-2 hover:bg-card-nested focus-within:bg-card-nested">
      <CategoryMark category={category} className={cn(!active && "opacity-60")} />
      <div className="min-w-0 flex-1">
        <p className={cn("flex min-w-0 items-center gap-2 font-display text-[15px] leading-snug font-semibold tracking-[-0.005em]", active ? "text-foreground" : "text-ink-2")}>
          <span className="truncate">{sub.name}</span>
          {trial ? <span className="readout shrink-0 rounded-pill bg-signal-soft px-1.5 py-0.5 text-foreground dark:text-signal">Trial</span> : null}
        </p>
        <p className={cn("tabular truncate text-[12.5px] leading-snug", soon ? "font-medium text-foreground" : "text-ink-2")}>{details.join(" · ")}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        {active ? (
          <>
            <span className="flex items-baseline gap-1">
              <MoneyText value={costOf(sub, "month")} className="text-[14px] font-medium text-foreground" />
              <span className="text-[11.5px] text-ink-3">/mo</span>
            </span>
            {notMonthly ? <MoneyText value={{ minor: sub.amountMinor, currency: sub.currency }} className="text-[11.5px] text-ink-3" /> : null}
          </>
        ) : (
          <MoneyText value={{ minor: sub.amountMinor, currency: sub.currency }} className="text-[13px] text-ink-2" />
        )}
      </div>
      <div className="flex shrink-0 items-center text-ink-3">
        {sub.cancelUrl && active ? (
          <Tip
            label="Open its cancel page"
            render={
              <a href={sub.cancelUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("ghost", "circle-sm", "size-7 text-ink-3")}>
                <ExternalLink aria-hidden className="size-[15px]" strokeWidth={1.75} />
                <span className="sr-only">Cancel page for {sub.name} (opens a new tab)</span>
              </a>
            }
          />
        ) : null}
        {sub.status !== "cancelled" ? (
          <Tip
            label={active ? "Pause" : "Resume"}
            render={
              <button
                type="button"
                onClick={() => {
                  onStatus(active ? "paused" : "active");
                }}
                className={buttonClass("ghost", "circle-sm", "size-7 text-ink-3")}
              >
                {active ? <Pause aria-hidden className="size-[15px]" strokeWidth={1.75} /> : <Play aria-hidden className="size-[15px]" strokeWidth={1.75} />}
                <span className="sr-only">
                  {active ? "Pause" : "Resume"} {sub.name}
                </span>
              </button>
            }
          />
        ) : null}
        <Tip
          label="Edit"
          render={
            <button type="button" onClick={onEdit} className={buttonClass("ghost", "circle-sm", "size-7 text-ink-3")}>
              <Pencil aria-hidden className="size-[15px]" strokeWidth={1.75} />
              <span className="sr-only">Edit {sub.name}</span>
            </button>
          }
        />
      </div>
    </li>
  );
}

/** Renewals and trial ends ahead, one group per day. */
function Timeline({ events, today }: { events: readonly SubEvent[]; today: Day }) {
  const days = React.useMemo(() => {
    const out: { on: Day; items: SubEvent[] }[] = [];
    for (const e of events) {
      const last = out.at(-1);
      if (last?.on === e.on) last.items.push(e);
      else out.push({ on: e.on, items: [e] });
    }
    return out;
  }, [events]);

  return (
    <section aria-labelledby="subs-upcoming" className="bento flex min-w-0 flex-col gap-4 p-5">
      <header className="flex items-center justify-between gap-3">
        <h2 id="subs-upcoming" className="font-display text-[17px] leading-tight text-foreground">
          Upcoming
        </h2>
        <span className="readout tabular">Next {AHEAD_DAYS} days</span>
      </header>
      {days.length === 0 ? (
        <p className="text-[13px] text-ink-2">Nothing renews in the next {AHEAD_DAYS} days.</p>
      ) : (
        <ol className="flex flex-col">
          {days.map((d, i) => {
            const n = daysBetween(today, d.on);
            return (
              <li key={d.on} className="relative grid grid-cols-[14px_minmax(0,1fr)] gap-x-3 pb-4 last:pb-0">
                {i < days.length - 1 ? <span aria-hidden className="absolute top-4 bottom-0 left-[6.5px] w-px bg-border dark:bg-glass-border" /> : null}
                <span aria-hidden className={cn("mt-1 size-3.5 rounded-full ring-2 ring-sheet", n <= 3 ? "bg-signal" : "bg-ink-3/50")} />
                <div className="min-w-0">
                  <p className="flex items-baseline justify-between gap-2">
                    <span className="tabular text-[13px] font-medium text-foreground">{dayLabel(d.on, today)}</span>
                    {n > 0 ? <span className={cn("readout tabular", n <= 3 && "text-foreground")}>{dueLabel(d.on, today)}</span> : null}
                  </p>
                  <ul className="mt-1 flex flex-col gap-1">
                    {d.items.map((e) => (
                      <li key={`${e.sub.id}:${e.kind}`} className="flex items-center justify-between gap-3 text-[13px]">
                        <span className="flex min-w-0 items-center gap-2 text-ink-2">
                          {e.kind === "trial" ? <CalendarClock aria-hidden className="size-3.5 shrink-0 text-warn" strokeWidth={1.75} /> : null}
                          <span className="truncate">
                            {e.sub.name}
                            {e.kind === "trial" ? " trial ends" : ""}
                          </span>
                        </span>
                        {e.kind === "renew" ? (
                          <MoneyText value={{ minor: e.sub.amountMinor, currency: e.sub.currency }} className="shrink-0 text-foreground" />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

const UNITS: readonly { value: SubCycle; label: string }[] = [
  { value: "day", label: "Days" },
  { value: "week", label: "Weeks" },
  { value: "month", label: "Months" },
  { value: "year", label: "Years" },
];

const REMIND_PRESETS = [0, 1, 2, 3, 5, 7, 14, 30] as const;
const remindLabel = (n: number) => (n === 0 ? "On the day" : n === 1 ? "1 day before" : `${String(n)} days before`);

const STATUS_OPTIONS: readonly { value: SubStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "cancelled", label: "Cancelled" },
];

function SubscriptionForm({
  payload,
  today,
  initial,
  onDone,
  onDelete,
}: {
  payload: MoneyPayload;
  today: Day;
  initial: Subscription | null;
  onDone: (sub: Subscription) => void;
  onDelete: (sub: Subscription) => void;
}) {
  const id = React.useId();
  const start = initial ?? { ...blankSubscription(today, payload.baseCurrency), categoryId: payload.categories.find((c) => c.slug === "subscriptions" && !c.archived)?.id ?? null };
  const [name, setName] = React.useState(start.name);
  const [currency, setCurrency] = React.useState<Currency>(start.currency);
  const [amount, setAmount] = React.useState(initial ? toInputString(initial.amountMinor, initial.currency) : "");
  const [every, setEvery] = React.useState(String(start.intervalCount));
  const [cycle, setCycle] = React.useState<SubCycle>(start.cycle);
  // An edit shows the next renewal; the stored anchor stays unless this is changed, so month ends never drift (V30).
  const shownNext = initial ? nextOn(initial, today) : start.anchorOn;
  const [renewOn, setRenewOn] = React.useState<Day>(shownNext);
  const [trialOn, setTrialOn] = React.useState<Day | null>(start.trialEndsOn);
  const [remind, setRemind] = React.useState(start.remindDays);
  const [accountId, setAccountId] = React.useState<string | null>(start.accountId);
  const [categoryId, setCategoryId] = React.useState<string | null>(start.categoryId);
  const [cancelUrl, setCancelUrl] = React.useState(start.cancelUrl ?? "");
  const [status, setStatus] = React.useState<SubStatus>(start.status);
  const [tried, setTried] = React.useState(false);

  const categories = React.useMemo(() => byId(payload.categories), [payload.categories]);
  const options = grouped(payload.categories, "expense");
  const openAccounts = payload.accounts.filter((a) => !a.archived || a.id === start.accountId);
  const minor = parseAmount(amount, currency);
  const interval = /^\d+$/.test(every.trim()) ? Number(every.trim()) : NaN;
  const url = cancelUrl.trim();

  const nameError = name.trim() === "" ? "Give it a name" : null;
  const amountError = amount.trim() === "" ? "Enter what it charges" : minor === null || minor === 0 ? `Not an amount${exponentOf(currency) === 0 ? " (no decimals in this currency)" : ""}` : null;
  const everyError = Number.isInteger(interval) && interval >= 1 && interval <= SUB_INTERVAL_MAX ? null : `A whole number from 1 to ${String(SUB_INTERVAL_MAX)}`;
  const urlError = url === "" || isWebUrl(url) ? null : "A web link starting with https://";
  const remindOptions = (REMIND_PRESETS as readonly number[]).includes(remind) ? REMIND_PRESETS : [...REMIND_PRESETS, remind].sort((a, b) => a - b);

  const submit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    setTried(true);
    if (nameError || amountError || everyError || urlError || minor === null) return;
    onDone({
      id: initial?.id ?? crypto.randomUUID(),
      createdAt: initial?.createdAt ?? stamp(),
      detectedFromTxn: initial?.detectedFromTxn ?? false,
      name: name.trim().slice(0, SUB_NAME_MAX),
      amountMinor: minor,
      currency,
      cycle,
      intervalCount: interval,
      anchorOn: initial ? editedAnchor(initial, { cycle, intervalCount: interval }, shownNext, renewOn, today) : renewOn,
      trialEndsOn: trialOn,
      remindDays: remind,
      accountId,
      categoryId,
      status,
      cancelUrl: url === "" ? null : url,
    });
  };

  const preview = minor && !everyError ? `${formatMoney({ minor, currency })} ${cycleLabel({ cycle, intervalCount: interval }).toLowerCase()}` : null;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div>
        <label htmlFor={`${id}-name`} className={LABEL}>
          Name
        </label>
        <input
          id={`${id}-name`}
          value={name}
          maxLength={SUB_NAME_MAX}
          autoComplete="off"
          onChange={(e) => {
            setName(e.target.value);
          }}
          placeholder="Netflix, gym, domain…"
          aria-invalid={tried && nameError !== null}
          className={FIELD}
        />
        {tried && nameError ? <p className="mt-1 text-[12px] text-destructive">{nameError}</p> : null}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_104px] gap-3">
        <div>
          <label htmlFor={`${id}-amount`} className={LABEL}>
            Charge
          </label>
          <input
            id={`${id}-amount`}
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
            }}
            placeholder={exponentOf(currency) > 0 ? "15.49" : "1500"}
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
          {tried && amountError ? <span className="text-destructive">{amountError}</span> : preview}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${id}-every`} className={LABEL}>
            Every
          </label>
          <div className="flex gap-2">
            <input
              id={`${id}-every`}
              inputMode="numeric"
              autoComplete="off"
              value={every}
              onChange={(e) => {
                setEvery(e.target.value);
              }}
              aria-invalid={tried && everyError !== null}
              className={cn(FIELD, "tabular w-14 shrink-0 text-center")}
            />
            <Select
              items={UNITS}
              value={cycle}
              onValueChange={(v) => {
                if (v) setCycle(v);
              }}
            >
              <SelectTrigger aria-label="Repeats every" className="min-w-0 pl-3">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNITS.map((u) => (
                  <SelectItem key={u.value} value={u.value}>
                    {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {tried && everyError ? <p className="mt-1 text-[12px] text-destructive">{everyError}</p> : null}
        </div>
        <div>
          <label htmlFor={`${id}-renew`} className={LABEL}>
            {initial ? "Next renewal" : "Renews on"}
          </label>
          <DatePicker
            id={`${id}-renew`}
            value={renewOn}
            onChange={setRenewOn}
            today={today}
            max={addDays(today, 3660)}
            presets={[{ label: "Today", day: today }]}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <span id={`${id}-trial-label`} className={LABEL}>
            Free trial ends
          </span>
          {trialOn ? (
            <div className="flex items-center gap-1" role="group" aria-labelledby={`${id}-trial-label`}>
              <div className="min-w-0 flex-1">
                <DatePicker value={trialOn} onChange={setTrialOn} today={today} max={addDays(today, 3660)} />
              </div>
              <button
                type="button"
                onClick={() => {
                  setTrialOn(null);
                }}
                className={buttonClass("ghost", "pill-sm", "shrink-0 px-2")}
              >
                Clear
              </button>
            </div>
          ) : (
            <button
              type="button"
              aria-describedby={`${id}-trial-label`}
              onClick={() => {
                setTrialOn(renewOn >= today ? renewOn : today);
              }}
              className={buttonClass("surface", "pill-sm", "h-10")}
            >
              <Plus aria-hidden />
              Add trial end
            </button>
          )}
        </div>
        <div>
          <label htmlFor={`${id}-remind`} className={LABEL}>
            Remind me
          </label>
          <Select
            items={remindOptions.map((n) => ({ value: n, label: remindLabel(n) }))}
            value={remind}
            onValueChange={(v) => {
              if (v !== null) setRemind(v);
            }}
          >
            <SelectTrigger id={`${id}-remind`} className="pl-3">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {remindOptions.map((n) => (
                <SelectItem key={n} value={n}>
                  {remindLabel(n)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${id}-account`} className={LABEL}>
            Paid from
          </label>
          <Select
            items={[{ value: null, label: "No account" }, ...openAccounts.map((a) => ({ value: a.id, label: a.name }))]}
            value={accountId}
            onValueChange={(v) => {
              setAccountId(v);
              const a = openAccounts.find((x) => x.id === v);
              // A new one on a dollar card is most likely charged in dollars.
              if (a && !initial && amount.trim() === "") setCurrency(a.currency);
            }}
          >
            <SelectTrigger id={`${id}-account`} className="pl-3">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>
                <span className="text-ink-2">No account</span>
              </SelectItem>
              {openAccounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  <span className="min-w-0 flex-1 truncate">{a.name}</span>
                  <span className="readout">{a.currency}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label htmlFor={`${id}-category`} className={LABEL}>
            Category
          </label>
          <Select
            items={[{ value: null, label: "No category" }, ...options.map(({ c }) => ({ value: c.id, label: c.name }))]}
            value={categoryId}
            onValueChange={(v) => {
              setCategoryId(v);
            }}
          >
            <SelectTrigger id={`${id}-category`}>
              <SelectValue>
                {(v: string | null) => {
                  const c = v ? categories.get(v) : undefined;
                  return (
                    <>
                      <CategoryMark category={c ?? null} className="size-7 text-[14px]" />
                      <span className={cn("truncate", !c && "text-ink-3")}>{c ? c.name : "No category"}</span>
                    </>
                  );
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>
                <CategoryMark category={null} className="size-7 text-[14px]" />
                <span>No category</span>
              </SelectItem>
              {options.map(({ c, child }) => (
                <SelectItem key={c.id} value={c.id} className={child ? "ml-5" : undefined}>
                  <CategoryMark category={c} className="size-7 text-[14px]" />
                  <span>{c.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <label htmlFor={`${id}-url`} className={LABEL}>
          Cancel page (optional)
        </label>
        <input
          id={`${id}-url`}
          type="url"
          inputMode="url"
          autoComplete="off"
          value={cancelUrl}
          maxLength={SUB_URL_MAX}
          onChange={(e) => {
            setCancelUrl(e.target.value);
          }}
          placeholder="https://…"
          aria-invalid={tried && urlError !== null}
          className={FIELD}
        />
        {tried && urlError ? <p className="mt-1 text-[12px] text-destructive">{urlError}</p> : null}
      </div>

      {initial ? <Segmented label="Status" value={status} options={STATUS_OPTIONS} onChange={setStatus} /> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="submit" className={buttonClass("inverse", "pill")}>
          {initial ? "Save changes" : "Add subscription"}
        </button>
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
        ) : null}
      </div>
    </form>
  );
}
