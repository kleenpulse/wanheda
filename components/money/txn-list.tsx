"use client";

import * as React from "react";
import { Pencil, Search, Trash2, X } from "lucide-react";
import { EmptyState } from "@/components/shell/page-frame";
import { buttonClass } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import { toDecimalString } from "@/lib/money/currency";
import { dayLabel, type Day } from "@/lib/money/dates";
import { categoryPath, totals, type Account, type Category, type Txn } from "@/lib/money/money";
import { NONE, normalPayee } from "@/lib/money/reports";
import { cn } from "@/lib/utils";
import type { ListFilter } from "./breakdown";
import { CategoryMark, MoneyText } from "./money-text";
import { useMoneyApi } from "./use-money";

// The period's txns by day (FR-MONEY-5), filtered by a search and by the row
// picked in the breakdown. Past VIRTUAL_AFTER rows only the rows near the
// viewport are rendered (SPEC T35); every row and day header has a fixed
// height, so the offsets are exact without measuring.

export const VIRTUAL_AFTER = 200;
const DAY_H = 40;
const ROW_H = 56;
const OVERSCAN_PX = 600;

/** A txn being edited, and the pencil it was opened from (the dialog grows out of it). */
export interface Editing {
  txn: Txn;
  origin: DOMRect;
}

type Item = { kind: "day"; day: Day; txns: Txn[] } | { kind: "txn"; txn: Txn };

function matches(t: Txn, q: string, categories: ReadonlyMap<string, Category>, accounts: ReadonlyMap<string, Account>): boolean {
  const c = t.categoryId ? categories.get(t.categoryId) : undefined;
  const hay = [t.payee, c ? categoryPath(c, categories) : "", accounts.get(t.accountId)?.name ?? "", t.note, t.tags.join(" "), toDecimalString(Math.abs(t.amountMinor), t.currency)]
    .join(" ")
    .toLowerCase();
  return q
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

function passes(t: Txn, f: ListFilter, categories: ReadonlyMap<string, Category>): boolean {
  if (f.by === "account") return t.accountId === f.key;
  if (f.by === "payee") return normalPayee(t.payee) === f.key;
  const c = t.categoryId ? categories.get(t.categoryId) : undefined;
  if (f.key === NONE) return !c;
  return c?.id === f.key || c?.parentId === f.key;
}

/** First index whose offset is greater than `y`. */
function upperBound(offsets: readonly number[], y: number): number {
  let lo = 0;
  let hi = offsets.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((offsets[mid] ?? 0) <= y) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Which items to render: all of them, or past the threshold only those near the viewport. */
function useWindowed(offsets: readonly number[], enabled: boolean) {
  const ref = React.useRef<HTMLDivElement>(null);
  const count = offsets.length - 1;
  const [range, setRange] = React.useState<readonly [number, number]>([0, Math.min(count, 60)]);
  React.useEffect(() => {
    if (!enabled) return;
    const update = () => {
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const start = Math.max(0, upperBound(offsets, -top - OVERSCAN_PX) - 1);
      const end = Math.min(count, upperBound(offsets, -top + window.innerHeight + OVERSCAN_PX));
      setRange((prev) => (prev[0] === start && prev[1] === end ? prev : [start, end]));
    };
    update();
    // Capture, so the scroll of whichever ancestor moves the page is heard.
    window.addEventListener("scroll", update, { passive: true, capture: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, { capture: true });
      window.removeEventListener("resize", update);
    };
  }, [enabled, offsets, count]);
  return { ref, range: enabled ? range : ([0, count] as const) };
}

export function TxnList({
  txns,
  today,
  categories,
  accounts,
  filter,
  onClearFilter,
  onEdit,
  emptyHint,
}: {
  /** Newest first. */
  txns: readonly Txn[];
  today: Day;
  categories: ReadonlyMap<string, Category>;
  accounts: ReadonlyMap<string, Account>;
  filter: ListFilter | null;
  onClearFilter: () => void;
  onEdit: (edit: Editing) => void;
  /** Shown when the owner has no txns at all. */
  emptyHint: React.ReactNode;
}) {
  const [query, setQuery] = React.useState("");
  const deferred = React.useDeferredValue(query.trim().toLowerCase());

  const shown = React.useMemo(
    () => txns.filter((t) => (!filter || passes(t, filter, categories)) && (!deferred || matches(t, deferred, categories, accounts))),
    [txns, filter, deferred, categories, accounts],
  );

  const { items, offsets } = React.useMemo(() => {
    const items: Item[] = [];
    let day = null as Extract<Item, { kind: "day" }> | null;
    for (const t of shown) {
      if (day?.day !== t.postedOn) {
        day = { kind: "day", day: t.postedOn, txns: [] };
        items.push(day);
      }
      day.txns.push(t);
      items.push({ kind: "txn", txn: t });
    }
    const offsets = [0];
    for (const it of items) offsets.push((offsets.at(-1) ?? 0) + (it.kind === "day" ? DAY_H : ROW_H));
    return { items, offsets };
  }, [shown]);

  const virtual = shown.length > VIRTUAL_AFTER;
  const { ref, range } = useWindowed(offsets, virtual);
  const [start, end] = range;
  const total = offsets.at(-1) ?? 0;

  const renderItem = (it: Item) => {
    if (it.kind === "txn") {
      return (
        <TxnRow
          key={it.txn.id}
          txn={it.txn}
          category={it.txn.categoryId ? (categories.get(it.txn.categoryId) ?? null) : null}
          categories={categories}
          account={accounts.get(it.txn.accountId)}
          onEdit={onEdit}
        />
      );
    }
    const dayTotals = totals(it.txns, categories, it.day, it.day);
    return (
      <li key={`day:${it.day}`} className="flex h-10 items-end justify-between gap-3 px-3 pb-1.5">
        <h4 className="readout">{dayLabel(it.day, today)}</h4>
        {/* The day's total only when it adds something: with one spend it would repeat the row (user 2026-11-05). */}
        {dayTotals.spendCount > 1 ? (
          <span className="readout flex gap-2">
            Spent
            {dayTotals.spend.map((m) => (
              <MoneyText roll key={m.currency} value={m} />
            ))}
          </span>
        ) : null}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex min-w-0 flex-1 items-center">
          <span className="sr-only">Search entries</span>
          <Search aria-hidden className="pointer-events-none absolute left-3 size-4 text-ink-3" strokeWidth={1.75} />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            placeholder="Search payee, category, note, amount"
            className="h-10 w-full min-w-0 rounded-pill bg-sheet pr-3 pl-9 text-[13.5px] text-foreground ring-1 ring-border outline-none placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-ring dark:bg-card-nested dark:ring-glass-border"
          />
        </label>
        {filter ? (
          <button
            type="button"
            onClick={onClearFilter}
            className="inline-flex h-10 max-w-full items-center gap-1.5 rounded-pill bg-card-nested pr-2.5 pl-3.5 text-[13px] text-foreground ring-1 ring-border outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring dark:ring-glass-border"
          >
            <span className="truncate">{filter.label}</span>
            <X aria-hidden className="size-3.5 text-ink-2" strokeWidth={2} />
            <span className="sr-only">Clear the {filter.by} filter</span>
          </button>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <div className="bento p-2">
          {txns.length === 0 ? (
            <EmptyState title="Nothing in this period" body={emptyHint} />
          ) : (
            <EmptyState title="No matches" body="Try fewer words, or clear the filter." />
          )}
        </div>
      ) : (
        <div className="bento p-1.5 pt-0">
          <div ref={ref} style={virtual ? { height: total, position: "relative" } : undefined}>
            <ul
              className={cn("flex flex-col", virtual && "absolute inset-x-0 top-0")}
              style={virtual ? { transform: `translateY(${String(offsets[start] ?? 0)}px)` } : undefined}
            >
              {items.slice(start, end).map(renderItem)}
            </ul>
          </div>
        </div>
      )}
      {shown.length > 0 ? (
        <p className="tabular px-1 text-[12px] text-ink-3">
          {shown.length === 1 ? "1 entry" : `${String(shown.length)} entries`}
          {shown.length !== txns.length ? ` of ${String(txns.length)}` : ""}
        </p>
      ) : null}
    </div>
  );
}

function TxnRow({
  txn,
  category,
  categories,
  account,
  onEdit,
}: {
  txn: Txn;
  category: Category | null;
  categories: ReadonlyMap<string, Category>;
  account: Account | undefined;
  onEdit: (edit: Editing) => void;
}) {
  const api = useMoneyApi();
  const title = txn.payee || category?.name || "Untitled";
  const sub = [category && txn.payee ? categoryPath(category, categories) : category ? null : "No category", account?.name].filter(Boolean).join(" · ");
  const income = txn.amountMinor > 0;
  return (
    <li className="group flex h-14 items-center gap-3 rounded-[14px] px-2.5 hover:bg-card-nested focus-within:bg-card-nested">
      <CategoryMark category={category} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[15px] leading-snug font-semibold tracking-[-0.005em] text-foreground">{title}</p>
        <p className="truncate text-[12.5px] leading-snug text-ink-2">{sub}</p>
      </div>
      <MoneyText
        roll
        value={{ minor: txn.amountMinor, currency: txn.currency }}
        sign={income ? "always" : "auto"}
        className={cn("shrink-0 text-[14px] font-medium", income ? "text-ok" : "text-foreground")}
      />
      {/* Always shown (user 2026-11-05: hidden controls read as a padding gap), quiet until hovered. */}
      <div className="flex shrink-0 items-center text-ink-3">
        <Tip
          label="Edit"
          render={
            <button
              type="button"
              onClick={(e) => {
                onEdit({ txn, origin: e.currentTarget.getBoundingClientRect() });
              }}
              className={buttonClass("ghost", "circle-sm", "size-7 text-ink-3")}
            >
              <Pencil aria-hidden className="size-[15px]" strokeWidth={1.75} />
              <span className="sr-only">Edit {title}</span>
            </button>
          }
        />
        <Tip
          label="Delete"
          render={
            <button
              type="button"
              onClick={() => {
                api.remove(txn);
              }}
              className={buttonClass("ghost", "circle-sm", "size-7 text-ink-3 hover:text-destructive")}
            >
              <Trash2 aria-hidden className="size-[15px]" strokeWidth={1.75} />
              <span className="sr-only">Delete {title}</span>
            </button>
          }
        />
      </div>
    </li>
  );
}
