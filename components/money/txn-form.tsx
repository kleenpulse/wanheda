"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { exponentOf, formatMoney, parseAmount } from "@/lib/money/currency";
import { addDays, isDay, type Day } from "@/lib/money/dates";
import { PAYEE_MAX, byId, defaultAccount, type Category, type MoneyPayload } from "@/lib/money/money";
import { cn } from "@/lib/utils";
import { CategoryMark } from "./money-text";
import { lastAccountId, newTxn, useMoneyApi } from "./use-money";

// The keyboard-first add form (FR-MONEY-3): amount, then Tab through
// category, payee, account and day; Enter saves from any field and the form
// is ready for the next one. On a phone it lives in a bottom sheet with the
// most-used categories as big chips, so one thumb can do it.

type Direction = "out" | "in";
const DIRECTIONS = [
  { value: "out", label: "Money out" },
  { value: "in", label: "Money in" },
] as const;

const FIELD =
  "h-10 w-full min-w-0 rounded-[12px] bg-sheet px-3 text-[14px] text-foreground ring-1 ring-border outline-none placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-ring dark:bg-card-nested dark:ring-glass-border";
const LABEL = "readout mb-1.5 block";

/** Categories for the picker: parents, each followed by its children, per kind. */
function grouped(categories: readonly Category[], kind: Category["kind"]) {
  const live = categories.filter((c) => !c.archived && c.kind === kind);
  const tops = live.filter((c) => !c.parentId);
  return tops.flatMap((p) => [{ c: p, child: false }, ...live.filter((c) => c.parentId === p.id).map((c) => ({ c, child: true }))]);
}

/** The categories used most in the window, for the phone's chips. */
function topCategories(payload: MoneyPayload, kind: Category["kind"], n: number): Category[] {
  const counts = new Map<string, number>();
  for (const t of payload.txns) if (t.categoryId) counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1);
  const live = payload.categories.filter((c) => !c.archived && c.kind === kind);
  return [...live].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0)).slice(0, n);
}

export function TxnForm({
  payload,
  today,
  variant,
  onSaved,
  autoFocus,
}: {
  payload: MoneyPayload;
  today: Day;
  variant: "inline" | "sheet";
  onSaved?: () => void;
  autoFocus?: boolean;
}) {
  const api = useMoneyApi();
  const categories = React.useMemo(() => byId(payload.categories), [payload.categories]);
  const openAccounts = payload.accounts.filter((a) => !a.archived);
  const [direction, setDirection] = React.useState<Direction>("out");
  const [amount, setAmount] = React.useState("");
  const [categoryId, setCategoryId] = React.useState<string>("");
  const [payee, setPayee] = React.useState("");
  const [accountId, setAccountId] = React.useState<string>(() => defaultAccount(payload.accounts, lastAccountId())?.id ?? "");
  const [day, setDay] = React.useState<Day>(today);
  const [tried, setTried] = React.useState(false);
  const amountRef = React.useRef<HTMLInputElement>(null);
  const formId = React.useId();

  // An account that went away (archived on another device) falls back to the default.
  const account = openAccounts.find((a) => a.id === accountId) ?? defaultAccount(payload.accounts, lastAccountId());
  const minor = account ? parseAmount(amount, account.currency) : null;
  const amountError = amount.trim() === "" ? "Enter an amount" : minor === null || minor === 0 ? "Not an amount" : null;
  const kind = direction === "in" ? "income" : "expense";
  const options = grouped(payload.categories, kind);
  const chips = variant === "sheet" ? topCategories(payload, kind, 8) : [];
  // What the triggers show for the chosen value (the mark beside it carries the emoji).
  const categoryItems = [{ value: null, label: "No category" }, ...options.map(({ c }) => ({ value: c.id, label: c.name }))];
  const accountItems = openAccounts.map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}` }));

  const pickCategory = (id: string) => {
    setCategoryId(id);
    const c = categories.get(id);
    if (c?.kind === "income") setDirection("in");
    else if (c?.kind === "expense") setDirection("out");
  };

  const submit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setTried(true);
    if (!account || minor === null || minor === 0 || !isDay(day)) return;
    const txn = newTxn({
      accountId: account.id,
      postedOn: day,
      amountMinor: direction === "in" ? minor : -minor,
      currency: account.currency,
      payee: payee.trim().slice(0, PAYEE_MAX),
      categoryId: categoryId || null,
      tags: [],
    });
    void api.save(txn);
    setAmount("");
    setPayee("");
    setCategoryId("");
    setTried(false);
    onSaved?.();
    amountRef.current?.focus();
  };

  const preview = account && minor ? formatMoney({ minor: direction === "in" ? minor : -minor, currency: account.currency }, { sign: "always" }) : null;
  const decimals = account ? exponentOf(account.currency) : 2;

  return (
    <form onSubmit={submit} noValidate aria-label="Add a transaction" className="@container flex flex-col gap-4">
      <Segmented
        label="Direction"
        value={direction}
        options={DIRECTIONS}
        onChange={(d) => {
          setDirection(d);
          const c = categories.get(categoryId);
          if (c && c.kind !== (d === "in" ? "income" : "expense")) setCategoryId("");
        }}
      />

      <div>
        <label htmlFor={`${formId}-amount`} className={LABEL}>
          Amount{account ? ` (${account.currency})` : ""}
        </label>
        <input
          ref={amountRef}
          id={`${formId}-amount`}
          autoFocus={autoFocus}
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
          }}
          placeholder={decimals > 0 ? "4,500 or 4.5k" : "4500"}
          aria-invalid={tried && amountError !== null}
          aria-describedby={`${formId}-amount-note`}
          className={cn(FIELD, "tabular", variant === "sheet" ? "h-16 text-[30px] font-semibold" : "h-12 text-[20px] font-semibold")}
        />
        <p id={`${formId}-amount-note`} className="tabular mt-1 min-h-[18px] text-[12px] text-ink-2" aria-live="polite">
          {tried && amountError ? <span className="text-destructive">{amountError}</span> : preview}
        </p>
      </div>

      {chips.length > 0 ? (
        <div role="group" aria-label="Common categories" className="grid grid-cols-4 gap-2">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={categoryId === c.id}
              onClick={() => {
                pickCategory(categoryId === c.id ? "" : c.id);
              }}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-1 rounded-[14px] px-1 py-2 text-[11.5px] leading-tight text-ink-2 ring-1 ring-border outline-none focus-visible:ring-2 focus-visible:ring-ring dark:ring-glass-border",
                categoryId === c.id ? "bg-signal-soft text-foreground ring-signal" : "bg-sheet dark:bg-card-nested",
              )}
            >
              <span aria-hidden className="text-[20px]">
                {c.emoji}
              </span>
              <span className="line-clamp-2 text-center">{c.name}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 @md:grid-cols-2">
        <div>
          <label htmlFor={`${formId}-category`} className={LABEL}>
            Category
          </label>
          <Select
            items={categoryItems}
            value={categoryId || null}
            onValueChange={(v) => {
              pickCategory(v ?? "");
            }}
          >
            <SelectTrigger id={`${formId}-category`}>
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
                <SelectItem key={c.id} value={c.id} className={child ? "ml-5 before:absolute before:inset-y-1 before:-left-2 before:w-px before:bg-border dark:before:bg-glass-border" : undefined}>
                  <CategoryMark category={c} className="size-7 text-[14px]" />
                  <span>{c.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label htmlFor={`${formId}-payee`} className={LABEL}>
            Payee or what for
          </label>
          <input
            id={`${formId}-payee`}
            value={payee}
            maxLength={PAYEE_MAX}
            autoComplete="off"
            enterKeyHint="done"
            onChange={(e) => {
              setPayee(e.target.value);
            }}
            placeholder={direction === "in" ? "Client, employer" : "Jollof spot, Uber"}
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor={`${formId}-account`} className={LABEL}>
            Account
          </label>
          <Select
            items={accountItems}
            value={account?.id ?? null}
            onValueChange={(v) => {
              if (v) setAccountId(v);
            }}
          >
            <SelectTrigger id={`${formId}-account`} className="pl-3">
              <SelectValue placeholder="No account" />
            </SelectTrigger>
            <SelectContent>
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
          <label htmlFor={`${formId}-day`} className={LABEL}>
            Day
          </label>
          <div className="flex gap-2">
            <input
              id={`${formId}-day`}
              type="date"
              value={day}
              max={addDays(today, 366)}
              onChange={(e) => {
                if (isDay(e.target.value)) setDay(e.target.value);
              }}
              className={cn(FIELD, "tabular")}
            />
            <button
              type="button"
              onClick={() => {
                setDay(day === today ? addDays(today, -1) : today);
              }}
              className={buttonClass("surface", "pill-sm", "h-10 shrink-0")}
            >
              {day === today ? "Yesterday" : "Today"}
            </button>
          </div>
        </div>
      </div>

      <button type="submit" disabled={!account} className={buttonClass("inverse", "pill", variant === "sheet" ? "h-14 w-full text-[15px]" : "self-start")}>
        <Check aria-hidden />
        Add {direction === "in" ? "income" : "expense"}
      </button>
      {!account ? <p className="text-[12.5px] text-ink-2">No open account yet. Accounts arrive with the next update.</p> : null}
    </form>
  );
}
