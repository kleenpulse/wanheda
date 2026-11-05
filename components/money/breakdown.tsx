"use client";

import * as React from "react";
import { Banknote, Bitcoin, CreditCard, Landmark, Wallet, type LucideIcon } from "lucide-react";
import { Segmented } from "@/components/ui/segmented";
import type { Currency } from "@/lib/money/currency";
import type { Account, AccountKind, Category } from "@/lib/money/money";
import { NONE, type BreakdownRow, type GroupBy, type Side } from "@/lib/money/reports";
import { cn } from "@/lib/utils";
import { Delta } from "./charts/chart-kit";
import { CategoryMark, categoryBg, MoneyText } from "./money-text";

// Totals per category, account or payee (FR-MONEY-5), as ranked bars rather
// than the FRD's donut: bars on one baseline compare parts more exactly, and
// the list already carries every name and figure (dataviz: part-to-whole).
// A category bar wears its own colour (colour follows the entity); accounts
// and payees are one series, so one hue. Each row filters the list below.

export interface ListFilter {
  by: GroupBy;
  key: string;
  label: string;
}

const SHOWN = 8;

export const ACCOUNT_ICON: Record<AccountKind, LucideIcon> = {
  cash: Banknote,
  bank: Landmark,
  card: CreditCard,
  wallet: Wallet,
  crypto: Bitcoin,
};

function AccountMark({ kind }: { kind: AccountKind | undefined }) {
  const Icon = kind ? ACCOUNT_ICON[kind] : Wallet;
  return (
    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-card-nested text-ink-2 ring-1 ring-border dark:ring-glass-border">
      <Icon className="size-4" strokeWidth={1.75} />
    </span>
  );
}

function PayeeMark({ name }: { name: string }) {
  return (
    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-card-nested font-display text-[14px] font-semibold text-ink-2 ring-1 ring-border uppercase dark:ring-glass-border">
      {name.trim().charAt(0) || "·"}
    </span>
  );
}

export function Breakdown({
  rows,
  by,
  onBy,
  side,
  onSide,
  categories,
  accounts,
  currency,
  against,
  picked,
  onPick,
}: {
  rows: readonly BreakdownRow[];
  by: GroupBy;
  onBy: (by: GroupBy) => void;
  side: Side;
  onSide: (side: Side) => void;
  categories: ReadonlyMap<string, Category>;
  accounts: ReadonlyMap<string, Account>;
  currency: Currency;
  /** "vs 1–5 Oct": what the change chips compare with. */
  against: string;
  picked: ListFilter | null;
  onPick: (filter: ListFilter | null) => void;
}) {
  const [all, setAll] = React.useState(false);
  const total = rows.reduce((s, r) => s + Math.max(0, r.minor), 0);
  const max = Math.max(1, ...rows.map((r) => r.minor));
  const shown = all ? rows : rows.slice(0, SHOWN);

  const nameOf = (r: BreakdownRow): string => {
    if (by === "account") return accounts.get(r.key)?.name ?? "Unknown account";
    if (by === "payee") return r.key === NONE ? "No payee" : r.label;
    if (r.key === NONE) return "No category";
    return categories.get(r.key)?.name ?? "Unknown category";
  };
  const markOf = (r: BreakdownRow) => {
    if (by === "account") return <AccountMark kind={accounts.get(r.key)?.kind} />;
    if (by === "payee") return <PayeeMark name={nameOf(r)} />;
    return <CategoryMark category={categories.get(r.key) ?? null} />;
  };
  const barOf = (key: string) => {
    if (by !== "category") return "bg-signal";
    const c = categories.get(key);
    return c ? categoryBg(c.color) : "bg-ink-3";
  };

  const row = (r: BreakdownRow, child: boolean) => {
    const name = nameOf(r);
    const isPicked = picked?.by === by && picked.key === r.key;
    const share = total > 0 ? Math.round((Math.max(0, r.minor) * 100) / total) : 0;
    return (
      <li key={r.key}>
        <button
          type="button"
          aria-pressed={isPicked}
          onClick={() => {
            onPick(isPicked ? null : { by, key: r.key, label: name });
          }}
          className={cn(
            "flex w-full items-center gap-3 rounded-[14px] px-2.5 text-left outline-none transition-colors hover:bg-card-nested focus-visible:ring-2 focus-visible:ring-ring",
            child ? "py-1.5 pl-[3.25rem]" : "py-2",
            isPicked && "bg-card-nested ring-1 ring-border dark:ring-glass-border",
          )}
        >
          {child ? null : markOf(r)}
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="flex items-baseline justify-between gap-3">
              <span className={cn("truncate text-foreground", child ? "text-[13px]" : "font-display text-[15px] font-semibold tracking-[-0.005em]")}>{name}</span>
              <MoneyText value={{ minor: r.minor, currency }} className={cn("shrink-0 text-foreground", child ? "text-[13px]" : "text-[14px] font-medium")} />
            </span>
            <span aria-hidden className="h-1 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
              <span className={cn("block h-full rounded-full", barOf(r.key))} style={{ width: `${String(Math.max(0, (r.minor / max) * 100))}%` }} />
            </span>
            <span className="flex items-center justify-between gap-3 text-[12px] text-ink-2">
              <span className="tabular truncate">
                {r.count === 1 ? "1 entry" : `${String(r.count)} entries`} · {share}%
              </span>
              <Delta cur={r.minor} prev={r.prevMinor} goodWhenUp={side === "income"} against={against} className="shrink-0" />
            </span>
          </span>
        </button>
        {!child && r.children.length > 0 ? <ul className="flex flex-col">{r.children.map((c) => row(c, true))}</ul> : null}
      </li>
    );
  };

  return (
    <section aria-labelledby="money-breakdown" className="bento flex min-w-0 flex-col gap-3 p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="money-breakdown" className="readout">
          {side === "spend" ? "Spent" : "Received"} by {by}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Money out or in"
            value={side}
            onChange={onSide}
            options={[
              { value: "spend", label: "Out" },
              { value: "income", label: "In" },
            ]}
          />
          <Segmented
            label="Group by"
            value={by}
            onChange={(v) => {
              setAll(false);
              onBy(v);
            }}
            options={[
              { value: "category", label: "Category" },
              { value: "account", label: "Account" },
              { value: "payee", label: "Payee" },
            ]}
          />
        </div>
      </header>
      {rows.length === 0 ? (
        <p className="px-1 py-6 text-center text-[13px] text-ink-2">Nothing {side === "spend" ? "spent" : "received"} in this period.</p>
      ) : (
        <ul className="-mx-2.5 flex flex-col">{shown.map((r) => row(r, false))}</ul>
      )}
      {rows.length > SHOWN ? (
        <button
          type="button"
          onClick={() => {
            setAll((v) => !v);
          }}
          className="self-start rounded-pill px-1 text-[12.5px] font-medium text-ink-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {all ? "Show fewer" : `Show all ${String(rows.length)}`}
        </button>
      ) : null}
    </section>
  );
}
