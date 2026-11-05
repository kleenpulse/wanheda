"use client";

import * as React from "react";
import { Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { GrowDialog } from "@/components/ui/grow-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tip } from "@/components/ui/tooltip";
import { CURRENCY_CODES, exponentOf, formatMoney, parseAmount, sumByCurrency, toInputString, type Currency } from "@/lib/money/currency";
import { ACCOUNT_KINDS, ACCOUNT_NAME_MAX, type Account, type AccountKind, type MoneyPayload } from "@/lib/money/money";
import { accountBalance } from "@/lib/money/reports";
import { cn } from "@/lib/utils";
import { ACCOUNT_ICON } from "./breakdown";
import { MoneyStack, MoneyText } from "./money-text";
import { useAccountApi } from "./use-money";

// Accounts (FR-MONEY-1): each with its balance (opening + every txn on it),
// add, edit name, kind and opening balance, archive with an Undo. The
// currency is fixed once created: every txn on an account is in its currency
// (V28), so changing it would relabel amounts already there.

const KIND_LABEL: Record<AccountKind, string> = { cash: "Cash", bank: "Bank", card: "Card", wallet: "Wallet", crypto: "Crypto" };
const FIELD =
  "h-10 w-full min-w-0 rounded-[12px] bg-sheet px-3 text-[14px] text-foreground ring-1 ring-border outline-none placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-ring dark:bg-card-nested dark:ring-glass-border";
const LABEL = "readout mb-1.5 block";

interface Editing {
  account: Account | null;
  origin: DOMRect;
}

export function AccountsCard({ payload }: { payload: MoneyPayload }) {
  const api = useAccountApi();
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const [shown, setShown] = React.useState(editing);
  if (editing && editing !== shown) setShown(editing);
  const [showArchived, setShowArchived] = React.useState(false);

  const balanceOf = (a: Account) => accountBalance(a, payload.priorMinor?.[a.id] ?? 0, payload.txns, payload.since);
  const open = payload.accounts.filter((a) => !a.archived);
  const archived = payload.accounts.filter((a) => a.archived);
  const worth = sumByCurrency(open.map((a) => ({ minor: balanceOf(a), currency: a.currency }))).sort(
    (a, b) => Number(b.currency === payload.baseCurrency) - Number(a.currency === payload.baseCurrency),
  );

  const row = (a: Account) => {
    const Icon = ACCOUNT_ICON[a.kind];
    const balance = balanceOf(a);
    return (
      <li key={a.id} className="flex h-14 items-center gap-3 rounded-[14px] px-2.5 hover:bg-card-nested focus-within:bg-card-nested">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-card-nested text-ink-2 ring-1 ring-border dark:ring-glass-border">
          <Icon className="size-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("truncate font-display text-[15px] leading-snug font-semibold tracking-[-0.005em]", a.archived ? "text-ink-2" : "text-foreground")}>{a.name}</p>
          <p className="truncate text-[12.5px] leading-snug text-ink-2">
            {KIND_LABEL[a.kind]} · {a.currency}
            {a.archived ? " · Archived" : ""}
          </p>
        </div>
        <MoneyText roll value={{ minor: balance, currency: a.currency }} className={cn("shrink-0 text-[14px] font-medium", balance < 0 ? "text-warn" : "text-foreground")} />
        <div className="flex shrink-0 items-center text-ink-3">
          <Tip
            label="Edit"
            render={
              <button
                type="button"
                onClick={(e) => {
                  setEditing({ account: a, origin: e.currentTarget.getBoundingClientRect() });
                }}
                className={buttonClass("ghost", "circle-sm", "size-7 text-ink-3")}
              >
                <Pencil aria-hidden className="size-[15px]" strokeWidth={1.75} />
                <span className="sr-only">Edit {a.name}</span>
              </button>
            }
          />
          <Tip
            label={a.archived ? "Restore" : "Archive"}
            render={
              <button
                type="button"
                onClick={() => {
                  api.setArchived(a, !a.archived);
                }}
                className={buttonClass("ghost", "circle-sm", "size-7 text-ink-3")}
              >
                {a.archived ? <ArchiveRestore aria-hidden className="size-[15px]" strokeWidth={1.75} /> : <Archive aria-hidden className="size-[15px]" strokeWidth={1.75} />}
                <span className="sr-only">
                  {a.archived ? "Restore" : "Archive"} {a.name}
                </span>
              </button>
            }
          />
        </div>
      </li>
    );
  };

  return (
    <section aria-labelledby="money-accounts" className="bento flex flex-col gap-3 p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="money-accounts" className="font-display text-[17px] leading-tight text-foreground">
            Accounts
          </h2>
          {worth.length > 0 ? (
            <MoneyStack values={worth} fallback={{ minor: 0, currency: payload.baseCurrency }} className="mt-1 text-[13px] text-ink-2" />
          ) : null}
        </div>
        <button
          type="button"
          onClick={(e) => {
            setEditing({ account: null, origin: e.currentTarget.getBoundingClientRect() });
          }}
          className={buttonClass("surface", "pill-sm")}
        >
          <Plus aria-hidden />
          Add account
        </button>
      </header>
      {open.length === 0 ? <p className="py-2 text-[13px] text-ink-2">No open accounts. Add one to start logging.</p> : <ul className="-mx-2.5 flex flex-col">{open.map(row)}</ul>}
      {archived.length > 0 ? (
        <>
          <button
            type="button"
            aria-expanded={showArchived}
            onClick={() => {
              setShowArchived((v) => !v);
            }}
            className="self-start rounded-pill px-1 text-[12.5px] font-medium text-ink-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {showArchived ? "Hide archived" : `Archived (${String(archived.length)})`}
          </button>
          {showArchived ? <ul className="-mx-2.5 flex flex-col">{archived.map(row)}</ul> : null}
        </>
      ) : null}

      <GrowDialog
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        title={shown?.account ? "Edit account" : "Add account"}
        originRect={shown?.origin ?? null}
        initialFocus="input"
      >
        {shown ? (
          <AccountForm
            key={shown.account?.id ?? "new"}
            initial={shown.account}
            baseCurrency={payload.baseCurrency}
            onDone={(account) => {
              setEditing(null);
              api.save(account);
            }}
          />
        ) : null}
      </GrowDialog>
    </section>
  );
}

/** Reads an opening balance: digits as anywhere else, a leading minus for money owed. */
function parseOpening(text: string, currency: Currency): number | null {
  const t = text.trim();
  if (t === "") return 0;
  const negative = t.startsWith("-") || t.startsWith("−");
  const minor = parseAmount(negative ? t.slice(1) : t, currency);
  return minor === null ? null : negative && minor !== 0 ? -minor : minor;
}

function AccountForm({ initial, baseCurrency, onDone }: { initial: Account | null; baseCurrency: Currency; onDone: (account: Account) => void }) {
  const id = React.useId();
  const [name, setName] = React.useState(initial?.name ?? "");
  const [kind, setKind] = React.useState<AccountKind>(initial?.kind ?? "bank");
  const [currency, setCurrency] = React.useState<Currency>(initial?.currency ?? baseCurrency);
  const [opening, setOpening] = React.useState(initial && initial.openingMinor !== 0 ? `${initial.openingMinor < 0 ? "-" : ""}${toInputString(initial.openingMinor, initial.currency)}` : "");
  const [tried, setTried] = React.useState(false);

  const openingMinor = parseOpening(opening, currency);
  const nameError = name.trim() === "" ? "Give it a name" : null;
  const openingError = openingMinor === null ? `Not an amount${exponentOf(currency) === 0 ? " (no decimals in this currency)" : ""}` : null;

  const submit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    setTried(true);
    if (nameError || openingError || openingMinor === null) return;
    onDone({
      id: initial?.id ?? crypto.randomUUID(),
      slug: initial?.slug ?? null,
      name: name.trim(),
      kind,
      currency: initial?.currency ?? currency,
      openingMinor,
      archived: initial?.archived ?? false,
    });
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div>
        <label htmlFor={`${id}-name`} className={LABEL}>
          Name
        </label>
        <input
          id={`${id}-name`}
          value={name}
          maxLength={ACCOUNT_NAME_MAX}
          autoComplete="off"
          onChange={(e) => {
            setName(e.target.value);
          }}
          placeholder="GTBank, Kuda, Dollar card…"
          aria-invalid={tried && nameError !== null}
          className={FIELD}
        />
        {tried && nameError ? <p className="mt-1 text-[12px] text-destructive">{nameError}</p> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-kind`} className={LABEL}>
            Kind
          </label>
          <Select
            items={ACCOUNT_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
            value={kind}
            onValueChange={(v) => {
              if (v) setKind(v);
            }}
          >
            <SelectTrigger id={`${id}-kind`} className="pl-3">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACCOUNT_KINDS.map((k) => {
                const Icon = ACCOUNT_ICON[k];
                return (
                  <SelectItem key={k} value={k}>
                    <Icon aria-hidden className="size-4 text-ink-2" strokeWidth={1.75} />
                    <span>{KIND_LABEL[k]}</span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label htmlFor={`${id}-currency`} className={LABEL}>
            Currency
          </label>
          <Select
            items={CURRENCY_CODES.map((c) => ({ value: c, label: c }))}
            value={currency}
            disabled={initial !== null}
            onValueChange={(v) => {
              if (v) setCurrency(v);
            }}
          >
            <SelectTrigger id={`${id}-currency`} className="pl-3" aria-describedby={initial ? `${id}-currency-note` : undefined}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCY_CODES.map((c) => (
                <SelectItem key={c} value={c}>
                  <span className="min-w-0 flex-1">{c}</span>
                  <span className="readout">{formatMoney({ minor: 0, currency: c }).replace(/[\d.,\s]/g, "")}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {initial ? (
            <p id={`${id}-currency-note`} className="mt-1 text-[12px] text-ink-3">
              Fixed once created.
            </p>
          ) : null}
        </div>
      </div>

      <div>
        <label htmlFor={`${id}-opening`} className={LABEL}>
          Opening balance ({initial?.currency ?? currency})
        </label>
        <input
          id={`${id}-opening`}
          inputMode="decimal"
          autoComplete="off"
          value={opening}
          onChange={(e) => {
            setOpening(e.target.value);
          }}
          placeholder="0"
          aria-invalid={tried && openingError !== null}
          aria-describedby={`${id}-opening-note`}
          className={cn(FIELD, "tabular")}
        />
        <p id={`${id}-opening-note`} className="mt-1 text-[12px] text-ink-2" aria-live="polite">
          {tried && openingError ? (
            <span className="text-destructive">{openingError}</span>
          ) : openingMinor !== null && openingMinor !== 0 ? (
            <MoneyText value={{ minor: openingMinor, currency: initial?.currency ?? currency }} />
          ) : (
            "What it held before your first entry here. A minus for a card that starts in debt."
          )}
        </p>
      </div>

      <button type="submit" className={buttonClass("inverse", "pill", "self-start")}>
        {initial ? "Save changes" : "Add account"}
      </button>
    </form>
  );
}
