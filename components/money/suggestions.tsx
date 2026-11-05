"use client";

import * as React from "react";
import { Repeat, X } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { shortDayLabel, type Day } from "@/lib/money/dates";
import type { MoneyPayload } from "@/lib/money/money";
import { detectRecurring, type RecurringSuggestion } from "@/lib/money/recurring";
import { cycleLabel, SUB_REMIND_DEFAULT, type Subscription } from "@/lib/money/subscriptions";
import { MoneyText } from "./money-text";

// Recurring charges that look like subscriptions (FR-MONEY-11, SPEC T37):
// the same payee, a steady amount and a steady gap, three times or more. One
// click makes one; a dismissed suggestion stays dismissed on this device.

const DISMISSED_KEY = "wanheda-money-dismissed-suggestions";

function readDismissed(): Set<string> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]");
    return new Set(Array.isArray(raw) ? raw.filter((k): k is string => typeof k === "string") : []);
  } catch {
    return new Set();
  }
}

function writeDismissed(keys: ReadonlySet<string>) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...keys]));
  } catch {
    // Private mode: dismissed for this visit only.
  }
}

/** The subscription a suggestion turns into: anchored on its latest charge (V30), marked detected by the server (V28). */
export function subscriptionFrom(s: RecurringSuggestion, createdAt: number): Subscription {
  return {
    id: crypto.randomUUID(),
    name: s.name,
    amountMinor: s.amountMinor,
    currency: s.currency,
    cycle: s.cycle,
    intervalCount: s.intervalCount,
    anchorOn: s.lastOn,
    trialEndsOn: null,
    remindDays: SUB_REMIND_DEFAULT,
    accountId: s.accountId,
    categoryId: s.categoryId,
    status: "active",
    cancelUrl: null,
    detectedFromTxn: true,
    createdAt,
    fromTxn: s.lastTxnId,
  };
}

export function Suggestions({ payload, today, onAdd }: { payload: MoneyPayload; today: Day; onAdd: (sub: Subscription) => void }) {
  // Rendered only after hydration (useMoney), so localStorage is safe to read here.
  const [dismissed, setDismissed] = React.useState(readDismissed);
  const all = React.useMemo(() => detectRecurring(payload.txns, payload.subscriptions ?? [], today), [payload.txns, payload.subscriptions, today]);
  const shown = all.filter((s) => !dismissed.has(s.key));
  if (shown.length === 0) return null;

  const setKey = (key: string, on: boolean) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      writeDismissed(next);
      return next;
    });
  };

  return (
    <section aria-labelledby="subs-suggested" className="bento flex min-w-0 flex-col gap-3 p-5">
      <header className="min-w-0">
        <h2 id="subs-suggested" className="font-display text-[17px] leading-tight text-foreground">
          Looks like a subscription
        </h2>
        <p className="mt-1 text-[12.5px] text-ink-2">Charges that repeat at the same amount and pace. Add one to track its renewals.</p>
      </header>
      <ul className="flex flex-col gap-2">
        {shown.map((s) => (
          <li key={s.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[14px] bg-signal-soft/50 px-3 py-2.5">
            <Repeat aria-hidden className="size-4 shrink-0 text-signal" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium text-foreground">{s.name}</p>
              <p className="tabular text-[12.5px] text-ink-2">
                <MoneyText value={{ minor: s.amountMinor, currency: s.currency }} /> {cycleLabel(s).toLowerCase()} · {String(s.hits)} charges, last {shortDayLabel(s.lastOn)}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  onAdd(subscriptionFrom(s, Date.now()));
                  toast({ title: `Added ${s.name}`, body: "Edit it any time from the list." });
                }}
                className={buttonClass("inverse", "pill-sm")}
              >
                Add
              </button>
              <button
                type="button"
                aria-label={`Dismiss ${s.name}`}
                onClick={() => {
                  setKey(s.key, true);
                  toast({
                    id: `undo-dismiss:${s.key}`,
                    title: `Dismissed ${s.name}`,
                    action: {
                      label: "Undo",
                      onClick: () => {
                        setKey(s.key, false);
                      },
                    },
                  });
                }}
                className={buttonClass("ghost", "circle-sm", "size-8")}
              >
                <X aria-hidden />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
