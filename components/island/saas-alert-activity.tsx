"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CreditCard, TrendingUp, UserMinus, UserPlus, type LucideIcon } from "lucide-react";
import { IslandButton } from "@/components/island/money-alert-activity";
import { useIsland, type IslandActivity } from "@/components/island/live-activity";
import { useNotifications } from "@/components/notifications/notifications-provider";
import { useNow } from "@/hooks/use-now";
import { INCOME_HREF } from "@/lib/saas/alerts";
import { saasAlertsFrom, type SaasAlert, type SaasAlertType } from "@/lib/saas/saas-alerts";

// The island's `saas-alert` (FR-INCOME-11, V37). Which notices become alerts
// is decided by `saasAlertsFrom` (lib/saas/saas-alerts.ts), from the same
// unread income notices the centre shows, so the two never disagree. No
// amounts on the island (V25): the notice text never carries one, except a
// milestone's own label.

const META: Record<SaasAlertType, { icon: LucideIcon; tag: string }> = {
  new: { icon: UserPlus, tag: "New" },
  churn: { icon: UserMinus, tag: "Left" },
  failed: { icon: CreditCard, tag: "Failed" },
  mrr: { icon: TrendingUp, tag: "MRR" },
};

export function useSaasAlerts(): SaasAlert[] {
  const { notices } = useNotifications();
  const now = useNow(60_000);
  return React.useMemo(() => (now === null ? [] : saasAlertsFrom(notices, now)), [notices, now]);
}

function SaasCard({ alert }: { alert: SaasAlert }) {
  const { collapse } = useIsland();
  const { markRead } = useNotifications();
  const router = useRouter();
  const { notice } = alert;
  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="min-w-0">
        <p className="text-xs font-medium text-island-foreground/70">{notice.body ?? "Income"}</p>
        <p className="truncate text-lg leading-tight font-semibold text-island-foreground">{notice.title}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <IslandButton
          tone="signal"
          onClick={() => {
            collapse();
            markRead([notice.id]);
            router.push(INCOME_HREF);
          }}
        >
          Open income
        </IslandButton>
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

export function saasAlertActivity(alert: SaasAlert): IslandActivity {
  const { icon: Icon, tag } = META[alert.type];
  return {
    id: `saas:${alert.notice.id}`,
    label: alert.notice.title,
    status: alert.notice.body ? `, ${alert.notice.body}` : undefined,
    leading: <Icon aria-hidden className="size-3.5 text-signal" />,
    trailing: <span className="text-sm font-semibold text-signal">{tag}</span>,
    expanded: <SaasCard alert={alert} />,
  };
}
