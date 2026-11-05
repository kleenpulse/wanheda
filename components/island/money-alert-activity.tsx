"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, ExternalLink, Target } from "lucide-react";
import { useIsland, type IslandActivity } from "@/components/island/live-activity";
import { MoneyText } from "@/components/money/money-text";
import { useMoney } from "@/components/money/use-money";
import { useNotifications } from "@/components/notifications/notifications-provider";
import { useNow } from "@/hooks/use-now";
import { BUDGETS_HREF, budgetName, parseBudgetAlertKey, type Budget } from "@/lib/money/budgets";
import { daysBetween, DEFAULT_TIME_ZONE, shortDayLabel, todayIn, type Day } from "@/lib/money/dates";
import { byId, type Category } from "@/lib/money/money";
import { dueLabel, parseAlertKey, SUBSCRIPTIONS_HREF, type SubEventKind, type Subscription } from "@/lib/money/subscriptions";
import type { Notice } from "@/lib/notifications/notifications";
import { cn } from "@/lib/utils";

// The island's `money-alert` (V31): derived from the same facts as the
// notification centre, the unread money notices, so the two never disagree.
// A subscription reminder stays until it is dismissed (marked read) or its
// day passes; a budget alert until it is dismissed or its month ends. When
// the money cache is on the device, a subscription since paused, cancelled or
// deleted drops out (as does a deleted budget), and the card can show more.

export type MoneyAlert =
  | { type: "sub"; notice: Notice; on: Day; kind: SubEventKind; sub: Subscription | undefined }
  | { type: "budget"; notice: Notice; month: string; level: 80 | 100; budget: Budget | undefined; name: string };

export function useMoneyAlerts(): { alerts: MoneyAlert[]; today: Day } {
  const { notices } = useNotifications();
  // Reads whatever money cache the device holds; never fetches for the island.
  const { data } = useMoney({ enabled: false });
  const now = useNow(60_000);
  const today = todayIn(data?.timeZone ?? DEFAULT_TIME_ZONE, now === null ? new Date() : new Date(now));
  const subs = data?.subscriptions;
  const budgets = data?.budgets;
  const categories = data?.categories;
  const alerts = React.useMemo(() => {
    const out: MoneyAlert[] = [];
    const cats: ReadonlyMap<string, Category> = byId(categories ?? []);
    for (const notice of notices) {
      if (notice.kind !== "money" || notice.readAt !== null) continue;
      const key = parseAlertKey(notice.dedupeKey);
      if (key) {
        if (key.on < today) continue;
        const sub = subs?.find((s) => s.id === key.subId);
        if (subs && (!sub || sub.status !== "active")) continue;
        out.push({ type: "sub", notice, on: key.on, kind: key.kind, sub });
        continue;
      }
      const b = parseBudgetAlertKey(notice.dedupeKey);
      if (!b || b.month !== today.slice(0, 7)) continue;
      const budget = budgets?.find((x) => (b.target === "all" ? x.categoryId === null : x.id === b.target));
      if (budgets && !budget) continue;
      out.push({ type: "budget", notice, month: b.month, level: b.level, budget, name: budget ? budgetName(budget, cats) : notice.title });
    }
    // Renewals by date first, then budgets (fullest first).
    const at = (a: MoneyAlert) => (a.type === "sub" ? a.on : "9999");
    return out.sort((a, b) => (at(a) < at(b) ? -1 : at(a) > at(b) ? 1 : a.type === "budget" && b.type === "budget" ? b.level - a.level : 0));
  }, [notices, subs, budgets, categories, today]);
  return { alerts, today };
}

type SubAlertView = Extract<MoneyAlert, { type: "sub" }>;
type BudgetAlertView = Extract<MoneyAlert, { type: "budget" }>;

function BudgetCard({ alert }: { alert: BudgetAlertView }) {
  const { collapse } = useIsland();
  const { markRead } = useNotifications();
  const router = useRouter();
  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-island-foreground/70">Budget</p>
          <p className="truncate text-lg leading-tight font-semibold text-island-foreground">{alert.name}</p>
        </div>
        <p className="tabular shrink-0 text-[1.75rem] leading-none font-light text-signal">{alert.level === 100 ? "Used up" : "80 %"}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <IslandButton
          tone="signal"
          onClick={() => {
            collapse();
            router.push(BUDGETS_HREF);
          }}
        >
          Open
        </IslandButton>
        <IslandButton
          onClick={() => {
            collapse();
            markRead([alert.notice.id]);
          }}
        >
          Dismiss
        </IslandButton>
      </div>
    </div>
  );
}

function AlertCard({ alert, today }: { alert: SubAlertView; today: Day }) {
  const { collapse } = useIsland();
  const { markRead } = useNotifications();
  const router = useRouter();
  const { notice, sub } = alert;
  const cancelUrl = sub?.cancelUrl;
  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="tabular text-xs font-medium text-island-foreground/70">
            {alert.kind === "trial" ? "Trial ends" : "Renews"} {shortDayLabel(alert.on)}
          </p>
          <p className="truncate text-lg leading-tight font-semibold text-island-foreground">{sub?.name ?? notice.title}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="tabular text-[1.75rem] leading-none font-light text-signal">{dueLabel(alert.on, today)}</p>
          {sub && alert.kind === "renew" ? (
            <MoneyText value={{ minor: sub.amountMinor, currency: sub.currency }} className="text-xs text-island-foreground/70" />
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <IslandButton
          tone="signal"
          onClick={() => {
            collapse();
            router.push(SUBSCRIPTIONS_HREF);
          }}
        >
          Open
        </IslandButton>
        {cancelUrl ? (
          <a
            href={cancelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(ISLAND_BUTTON, "bg-island-foreground/12 text-island-foreground hover:bg-island-foreground/20")}
          >
            <ExternalLink aria-hidden className="size-3.5" />
            Cancel page
          </a>
        ) : null}
        <IslandButton
          onClick={() => {
            collapse();
            markRead([notice.id]);
          }}
        >
          Dismiss
        </IslandButton>
      </div>
    </div>
  );
}

const ISLAND_BUTTON =
  "inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium outline-none transition-[background-color,transform] duration-150 active:scale-95 focus-visible:ring-2 focus-visible:ring-island-foreground/70";

function IslandButton({ tone = "plain", onClick, children }: { tone?: "plain" | "signal"; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(ISLAND_BUTTON, tone === "signal" ? "bg-signal/20 text-signal hover:bg-signal/30" : "bg-island-foreground/12 text-island-foreground hover:bg-island-foreground/20")}
    >
      {children}
    </button>
  );
}

/** "Today" or "3d": the one figure worth a glance on the pill. */
function shortDue(on: Day, today: Day): string {
  const n = daysBetween(today, on);
  return n <= 0 ? "Today" : `${String(n)}d`;
}

export function moneyAlertActivity(alert: MoneyAlert, today: Day): IslandActivity {
  if (alert.type === "budget") {
    return {
      id: `money:${alert.notice.id}`,
      label: `${alert.name} budget`,
      status: alert.level === 100 ? ", used up" : ", 80 % used",
      leading: <Target aria-hidden className="size-3.5 text-signal" />,
      trailing: <span className="tabular text-sm font-semibold text-signal">{alert.level === 100 ? "100%" : "80%"}</span>,
      expanded: <BudgetCard alert={alert} />,
    };
  }
  const name = alert.sub?.name ?? alert.notice.title;
  return {
    id: `money:${alert.notice.id}`,
    label: alert.kind === "trial" ? `${name} trial` : name,
    status: `, ${alert.kind === "trial" ? "trial ends" : "renews"} ${dueLabel(alert.on, today).toLowerCase()}`,
    leading: <CalendarClock aria-hidden className="size-3.5 text-signal" />,
    trailing: <span className="tabular text-sm font-semibold text-signal">{shortDue(alert.on, today)}</span>,
    expanded: <AlertCard alert={alert} today={today} />,
  };
}
