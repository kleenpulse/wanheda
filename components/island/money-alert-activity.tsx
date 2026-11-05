"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, ExternalLink, Target } from "lucide-react";
import { useIsland, type IslandActivity } from "@/components/island/live-activity";
import { MoneyText } from "@/components/money/money-text";
import { useMoney } from "@/components/money/use-money";
import { useNotifications } from "@/components/notifications/notifications-provider";
import { useNow } from "@/hooks/use-now";
import { BUDGETS_HREF } from "@/lib/money/budgets";
import { DEFAULT_TIME_ZONE, shortDayLabel, todayIn, type Day } from "@/lib/money/dates";
import { moneyAlertsFrom, shortDue, type MoneyAlert } from "@/lib/money/money-alerts";
import { dueLabel, SUBSCRIPTIONS_HREF } from "@/lib/money/subscriptions";
import { cn } from "@/lib/utils";

// The island's `money-alert` (V31). Which notices become alerts is decided by
// `moneyAlertsFrom` (lib/money/money-alerts.ts), from the same unread money
// notices the centre shows, so the two never disagree.

export function useMoneyAlerts(): { alerts: MoneyAlert[]; today: Day } {
  const { notices } = useNotifications();
  // Reads whatever money cache the device holds; never fetches for the island.
  const { data } = useMoney({ enabled: false });
  const now = useNow(60_000);
  const today = todayIn(data?.timeZone ?? DEFAULT_TIME_ZONE, now === null ? new Date() : new Date(now));
  const subscriptions = data?.subscriptions;
  const budgets = data?.budgets;
  const categories = data?.categories;
  const alerts = React.useMemo(() => moneyAlertsFrom(notices, { subscriptions, budgets, categories }, today), [notices, subscriptions, budgets, categories, today]);
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
        <p className={cn("tabular shrink-0 text-[1.75rem] leading-none font-light text-signal", alert.level !== 100 && "font-figure")}>{alert.level === 100 ? "Used up" : "80%"}</p>
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

/** The island card's pill button; shared by every alert card. */
export function IslandButton({ tone = "plain", onClick, children }: { tone?: "plain" | "signal"; onClick: () => void; children: React.ReactNode }) {
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

export function moneyAlertActivity(alert: MoneyAlert, today: Day): IslandActivity {
  if (alert.type === "budget") {
    return {
      id: `money:${alert.notice.id}`,
      label: `${alert.name} budget`,
      status: alert.level === 100 ? ", used up" : ", 80 % used",
      leading: <Target aria-hidden className="size-3.5 text-signal" />,
      trailing: <span className="tabular font-figure text-sm font-semibold text-signal">{alert.level === 100 ? "100%" : "80%"}</span>,
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
