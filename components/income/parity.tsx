"use client";

import { CircleCheck, CircleDashed, TriangleAlert, type LucideIcon } from "lucide-react";
import { ChartCard, ChartTable } from "@/components/money/charts/chart-kit";
import { MoneyText } from "@/components/money/money-text";
import { isCurrency } from "@/lib/money/currency";
import type { IncomeProduct, IncomeSnapshot, ParityDay, ParityState, ProductParity } from "@/lib/saas/income";
import { cn } from "@/lib/utils";

// Polar's own figures beside ours (V36). Polar reports USD and counts
// subscriptions; we count paying customers. A day off by more than 1 minor
// unit per active subscription is marked, with an icon and a word, never
// hidden; a day that can't be compared says why.

const STATE: Record<ParityState, { label: string; icon: LucideIcon; ink: string }> = {
  match: { label: "Matches", icon: CircleCheck, ink: "text-ok" },
  off: { label: "Off", icon: TriangleAlert, ink: "text-warn" },
  currency: { label: "Not comparable", icon: CircleDashed, ink: "text-ink-2" },
  "no-polar": { label: "No Polar figure", icon: CircleDashed, ink: "text-ink-2" },
  "no-computed": { label: "Not rebuilt yet", icon: CircleDashed, ink: "text-ink-2" },
};

function Figure({ s }: { s: IncomeSnapshot | null }) {
  if (!s) return <span className="text-ink-3">—</span>;
  return isCurrency(s.currency) ? <MoneyText value={{ minor: s.mrrMinor, currency: s.currency }} /> : <span className="text-ink-2">{s.currency}</span>;
}

function StateChip({ day }: { day: ParityDay }) {
  const meta = STATE[day.state];
  const Icon = meta.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[12px] font-medium", meta.ink)}>
      <Icon aria-hidden className="size-3.5" strokeWidth={2} />
      {meta.label}
      {day.state === "off" && day.diffMinor !== null ? (
        <span className="font-normal text-ink-2">
          {" by "}
          <MoneyText value={{ minor: Math.abs(day.diffMinor), currency: "USD" }} />
        </span>
      ) : null}
    </span>
  );
}

const WHY: Partial<Record<ParityState, string>> = {
  currency: "Ours is in another currency or leaves one out; Polar converts everything to USD.",
  "no-polar": "Sync with a token that can read metrics to fetch Polar's figures.",
  "no-computed": "Rebuild income figures to compute ours for this day.",
};

export function ParityCard({ rows, products }: { rows: readonly ProductParity[]; products: ReadonlyMap<string, IncomeProduct> }) {
  const name = (id: string) => products.get(id)?.name ?? "A removed product";
  const table = (
    <ChartTable
      caption="Polar against Wanheda, per product and day"
      head={["Day", "Ours", "Polar", "Customers / subs", "Parity"]}
      rows={rows.flatMap((r) =>
        r.days.map((d) => ({
          key: `${r.productId}:${d.onDate}`,
          cells: [
            `${name(r.productId)}, ${d.onDate}`,
            <Figure key="o" s={d.computed} />,
            <Figure key="p" s={d.polar} />,
            `${d.computed ? String(d.computed.customers) : "—"} / ${d.polar ? String(d.polar.customers) : "—"}`,
            <StateChip key="s" day={d} />,
          ],
        })),
      )}
    />
  );
  return (
    <ChartCard title="Polar parity" note="Our MRR beside Polar's own, per product. Polar is in USD and counts subscriptions." table={table}>
      {rows.length === 0 ? (
        <p className="py-4 text-[13px] text-ink-2">Map a Polar product to one of yours to compare figures.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => {
            const d = r.latest;
            return (
              <li key={r.productId} className="flex flex-col gap-1.5 rounded-[14px] bg-card-nested px-3.5 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="truncate text-[13.5px] font-medium text-foreground">{name(r.productId)}</span>
                  {d ? <StateChip day={d} /> : <span className="text-[12px] text-ink-2">No figures yet</span>}
                </div>
                {d ? (
                  <p className="tabular flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
                    <span>{d.onDate}</span>
                    <span>
                      Ours <Figure s={d.computed} />
                      {d.computed ? ` · ${String(d.computed.customers)} customers` : ""}
                    </span>
                    <span>
                      Polar <Figure s={d.polar} />
                      {d.polar ? ` · ${String(d.polar.customers)} subscriptions` : ""}
                    </span>
                  </p>
                ) : null}
                {d && WHY[d.state] ? <p className="text-[12px] text-ink-3">{WHY[d.state]}</p> : null}
                {r.offDays > 0 ? (
                  <p className="inline-flex items-center gap-1 text-[12px] text-warn">
                    <TriangleAlert aria-hidden className="size-3.5" strokeWidth={2} />
                    {r.offDays} of the last {r.days.length} days are off. The table lists each one.
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </ChartCard>
  );
}
