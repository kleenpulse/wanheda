"use client";

import * as React from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { EmptyState, SheetHeading } from "@/components/shell/page-frame";
import { buttonClass } from "@/components/ui/button";
import { GrowDialog } from "@/components/ui/grow-dialog";
import { Tip } from "@/components/ui/tooltip";
import { dayLabel, startOfMonth, type Day } from "@/lib/money/dates";
import { byId, categoryPath, totals, type Account, type Category, type MoneyPayload, type Txn } from "@/lib/money/money";
import { cn } from "@/lib/utils";
import { CategoryMark, MoneyStack, MoneyText } from "./money-text";
import { TxnForm } from "./txn-form";
import { useMoney, useMoneyApi, useToday } from "./use-money";

// Money, Phase 3 CP1 (FR-MONEY-2, 3, 5 in part): today and this month at a
// glance, the newest txns by day, and the add form. Paints from the cache at
// once; the page's Prefetch refreshes it (SPEC V24).

const RECENT_LIMIT = 60;

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
      <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-3">
        <div className="h-[118px] rounded-card bg-card-nested" />
        <div className="h-[118px] rounded-card bg-card-nested" />
        <div className="h-[118px] rounded-card bg-card-nested" />
      </div>
      <div className="h-[420px] rounded-card bg-card-nested" />
    </div>
  );
}

function MoneyView({ payload }: { payload: MoneyPayload }) {
  const today = useToday(payload.timeZone);
  const categories = React.useMemo(() => byId(payload.categories), [payload.categories]);
  const accounts = React.useMemo(() => byId(payload.accounts), [payload.accounts]);
  const base = payload.baseCurrency;
  const zero = { minor: 0, currency: base };
  const day = totals(payload.txns, categories, today, today);
  const month = totals(payload.txns, categories, startOfMonth(today), today);
  // Base currency first, then the rest as they come (no conversion until FX lands, V26).
  const baseFirst = (xs: Totals["spend"]) => [...xs].sort((a, b) => Number(b.currency === base) - Number(a.currency === base));
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const stale = payload.source === "load-failed";

  return (
    <div className="flex flex-col gap-6">
      {payload.source === "demo" ? null : stale ? (
        <p role="status" className="rounded-[14px] bg-card-nested px-3 py-2 text-[13px] text-ink-2 ring-1 ring-border dark:ring-glass-border">
          Showing what this device last loaded. The server didn&apos;t answer.
        </p>
      ) : null}

      <section aria-label="At a glance" className="grid grid-cols-1 gap-4 @xl:grid-cols-3">
        <Stat label="Spent today" note={day.spendCount === 1 ? "1 entry" : `${String(day.spendCount)} entries`} values={baseFirst(day.spend)} zero={zero} />
        <Stat label="Spent this month" note={monthName(today)} values={baseFirst(month.spend)} zero={zero} />
        <Stat label="In this month" note={monthName(today)} values={baseFirst(month.income)} zero={zero} />
      </section>

      <div className="grid grid-cols-1 items-start gap-6 @4xl:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
        <section aria-labelledby="money-recent" className="flex min-w-0 flex-col gap-3">
          <SheetHeading title={<span id="money-recent">Recent</span>} note={`Since ${dayLabel(payload.since, today)}`} />
          <Recent payload={payload} today={today} categories={categories} accounts={accounts} onEdit={setEditing} />
        </section>

        <aside aria-label="Add a transaction" className="bento hidden p-5 @4xl:sticky @4xl:top-6 @4xl:block">
          <h2 className="mb-4 font-display text-[17px] leading-tight text-foreground">Add</h2>
          <TxnForm payload={payload} today={today} variant="inline" />
        </aside>
      </div>

      <AddSheet payload={payload} today={today} open={sheetOpen} setOpen={setSheetOpen} />
      <EditDialog payload={payload} today={today} editing={editing} close={() => {
          setEditing(null);
        }} />
    </div>
  );
}

type Totals = ReturnType<typeof totals>;

/** A txn being edited, and the pencil it was opened from (the dialog grows out of it). */
interface Editing {
  txn: Txn;
  origin: DOMRect;
}

function monthName(today: Day): string {
  return new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(new Date(`${startOfMonth(today)}T00:00:00Z`));
}

function Stat({ label, note, values, zero }: { label: string; note: string; values: Totals["spend"]; zero: { minor: number; currency: MoneyPayload["baseCurrency"] } }) {
  return (
    <div className="bento flex min-w-0 flex-col gap-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="readout">{label}</h3>
        <span className="readout tabular truncate">{note}</span>
      </div>
      <MoneyStack values={values} fallback={zero} className="font-display text-[30px] leading-none font-semibold tracking-[-0.01em] text-foreground" />
    </div>
  );
}

function Recent({
  payload,
  today,
  categories,
  accounts,
  onEdit,
}: {
  payload: MoneyPayload;
  today: Day;
  categories: ReadonlyMap<string, Category>;
  accounts: ReadonlyMap<string, Account>;
  onEdit: (edit: Editing) => void;
}) {
  const shown = payload.txns.slice(0, RECENT_LIMIT);
  if (shown.length === 0) {
    return (
      <div className="bento p-2">
        <EmptyState
          title="Nothing logged yet"
          body={
            <>
              Type <span className="tabular font-medium text-foreground">4500 food jollof</span> into the palette (Ctrl K), or use the form.
            </>
          }
        />
      </div>
    );
  }
  const days: { day: Day; txns: Txn[] }[] = [];
  for (const t of shown) {
    const last = days.at(-1);
    if (last?.day === t.postedOn) last.txns.push(t);
    else days.push({ day: t.postedOn, txns: [t] });
  }
  return (
    <div className="flex flex-col gap-4">
      {days.map((d) => {
        const dayTotals = totals(d.txns, categories, d.day, d.day);
        return (
          <section key={d.day} aria-label={dayLabel(d.day, today)} className="bento overflow-hidden p-1.5">
            <header className="flex items-center justify-between gap-3 px-3 pt-2 pb-1.5">
              <h3 className="readout">{dayLabel(d.day, today)}</h3>
              {/* The day's total only when it adds something: with one spend it would repeat the row (user 2026-11-05). */}
              {dayTotals.spendCount > 1 ? (
                <span className="readout flex gap-2">
                  Spent
                  {dayTotals.spend.map((m) => (
                    <MoneyText key={m.currency} value={m} />
                  ))}
                </span>
              ) : null}
            </header>
            <ul className="flex flex-col">
              {d.txns.map((t) => (
                <TxnRow
                  key={t.id}
                  txn={t}
                  category={t.categoryId ? (categories.get(t.categoryId) ?? null) : null}
                  categories={categories}
                  account={accounts.get(t.accountId)}
                  onEdit={onEdit}
                />
              ))}
            </ul>
          </section>
        );
      })}
      {payload.txns.length > RECENT_LIMIT ? (
        <p className="px-1 text-[12px] text-ink-3">
          Showing the newest {RECENT_LIMIT}. Periods and the full list arrive with the next update.
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
    <li className="group flex items-center gap-3 rounded-[14px] px-2.5 py-2 hover:bg-card-nested focus-within:bg-card-nested">
      <CategoryMark category={category} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[15px] leading-snug font-semibold tracking-[-0.005em] text-foreground">{title}</p>
        <p className="truncate text-[12.5px] text-ink-2">{sub}</p>
      </div>
      <MoneyText
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
