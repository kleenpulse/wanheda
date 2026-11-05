"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/calendar";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { exponentOf, formatMoney, parseAmount, toInputString } from "@/lib/money/currency";
import { addDays, isDay, type Day } from "@/lib/money/dates";
import { CATEGORY_NAME_MAX, PAYEE_MAX, byId, defaultAccount, findCategoryByName, newCategory, type Category, type MoneyPayload, type Txn } from "@/lib/money/money";
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
/** The seeded catch-alls ("Other", "Other income"): listed last, after every named category. */
const CATCH_ALL = new Set(["other", "income-other"]);

export function grouped(categories: readonly Category[], kind: Category["kind"]) {
  const live = categories.filter((c) => !c.archived && c.kind === kind);
  const isCatchAll = (c: Category) => c.slug !== null && CATCH_ALL.has(c.slug);
  const tops = live.filter((c) => !c.parentId).sort((a, b) => Number(isCatchAll(a)) - Number(isCatchAll(b)));
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
  initial,
}: {
  payload: MoneyPayload;
  today: Day;
  variant: "inline" | "sheet";
  onSaved?: () => void;
  autoFocus?: boolean;
  /** Edit this txn instead of adding one: same id, so the write replaces it (V28). */
  initial?: Txn;
}) {
  const api = useMoneyApi();
  const categories = React.useMemo(() => byId(payload.categories), [payload.categories]);
  // An edited txn keeps its own account in the list, even if that account is archived now.
  const openAccounts = payload.accounts.filter((a) => !a.archived || a.id === initial?.accountId);
  const [direction, setDirection] = React.useState<Direction>(initial && initial.amountMinor > 0 ? "in" : "out");
  const [amount, setAmount] = React.useState(initial ? toInputString(initial.amountMinor, initial.currency) : "");
  const [categoryId, setCategoryId] = React.useState<string>(initial?.categoryId ?? "");
  const [payee, setPayee] = React.useState(initial?.payee ?? "");
  const [accountId, setAccountId] = React.useState<string>(() => initial?.accountId ?? defaultAccount(payload.accounts, lastAccountId())?.id ?? "");
  const [day, setDay] = React.useState<Day>(initial?.postedOn ?? today);
  const [tried, setTried] = React.useState(false);
  // Naming "Other" makes a real category for next time (user 2026-11-05).
  const [newName, setNewName] = React.useState("");
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

  const picked = categories.get(categoryId);
  const naming = picked?.slug != null && CATCH_ALL.has(picked.slug);

  const pickCategory = (id: string) => {
    setCategoryId(id);
    setNewName("");
    const c = categories.get(id);
    if (c?.kind === "income") setDirection("in");
    else if (c?.kind === "expense") setDirection("out");
  };

  const submit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setTried(true);
    if (!account || minor === null || minor === 0 || !isDay(day)) return;
    // A name typed for "Other": reuse a live category of that name, else make one, queued ahead of the txn.
    let chosen = categoryId || null;
    const typed = naming ? newName.trim() : "";
    if (typed !== "") {
      const existing = findCategoryByName(payload.categories, typed, kind);
      if (existing) chosen = existing.id;
      else {
        const made = newCategory(crypto.randomUUID(), typed, kind);
        api.saveCategory(made);
        chosen = made.id;
      }
    }
    const fields = {
      accountId: account.id,
      postedOn: day,
      amountMinor: direction === "in" ? minor : -minor,
      currency: account.currency,
      payee: payee.trim().slice(0, PAYEE_MAX),
      categoryId: chosen,
    };
    api.save(initial ? { ...initial, ...fields } : newTxn({ ...fields, tags: [] }));
    if (initial) {
      onSaved?.();
      return;
    }
    setAmount("");
    setPayee("");
    setCategoryId("");
    setNewName("");
    setTried(false);
    onSaved?.();
    amountRef.current?.focus();
  };

  const preview = account && minor ? formatMoney({ minor: direction === "in" ? minor : -minor, currency: account.currency }, { sign: "always" }) : null;
  const decimals = account ? exponentOf(account.currency) : 2;

  return (
    <form onSubmit={submit} noValidate aria-label={initial ? "Edit transaction" : "Add a transaction"} className="@container flex flex-col gap-4">
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
                <SelectItem key={c.id} value={c.id} className={child ? "pl-7 before:absolute before:inset-y-1 before:left-3 before:w-px before:bg-border" : undefined}>
                  <CategoryMark category={c} className="size-7 text-[14px]" />
                  <span>{c.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {naming ? (
            <div className="mt-2">
              <label htmlFor={`${formId}-new-category`} className="sr-only">
                Name a new category
              </label>
              <input
                id={`${formId}-new-category`}
                value={newName}
                maxLength={CATEGORY_NAME_MAX}
                autoComplete="off"
                enterKeyHint="done"
                onChange={(e) => {
                  setNewName(e.target.value);
                }}
                placeholder={kind === "income" ? "Name it: Rent in, Bonus… (optional)" : "Name it: Gym, Gifts… (optional)"}
                aria-describedby={`${formId}-new-category-note`}
                className={FIELD}
              />
              <p id={`${formId}-new-category-note`} className="mt-1 text-[12px] text-ink-2">
                {newName.trim() === ""
                  ? `Leave empty to keep ${picked.name}.`
                  : findCategoryByName(payload.categories, newName, kind)
                    ? "Uses the category you already have with this name."
                    : "Saved as a new category, ready next time."}
              </p>
            </div>
          ) : null}
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
          <DatePicker
            id={`${formId}-day`}
            value={day}
            onChange={setDay}
            today={today}
            max={addDays(today, 366)}
            presets={[
              { label: "Today", day: today },
              { label: "Yesterday", day: addDays(today, -1) },
              { label: "2 days ago", day: addDays(today, -2) },
            ]}
          />
        </div>
      </div>

      <button type="submit" disabled={!account} className={buttonClass("inverse", "pill", variant === "sheet" ? "h-14 w-full text-[15px]" : "self-start")}>
        <Check aria-hidden />
        {initial ? "Save changes" : `Add ${direction === "in" ? "income" : "expense"}`}
      </button>
      {!account ? <p className="text-[12.5px] text-ink-2">No open account yet. Add one under Accounts.</p> : null}
    </form>
  );
}
