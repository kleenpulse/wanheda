"use client";

import * as React from "react";
import { markNotificationsRead, notifyTimerDone } from "@/actions/notifications";
import { useActivity } from "@/lib/activity/store";
import { isRunning, type Timer } from "@/lib/activity/timer";
import { DEFAULT_TIME_ZONE, todayIn } from "@/lib/money/dates";
import { demoMoneyAlerts } from "@/lib/money/seed";
import { onNotices } from "@/lib/notifications/inbox";
import { addNotice, demoNotices, markRead, mergeNotices, timerDoneNotice, unreadCount, type Notice } from "@/lib/notifications/notifications";

/** owner: saved alerts. demo: sample alerts, never saved. load-failed: the list could not be read. */
export type NoticesSource = "owner" | "demo" | "load-failed";

interface NotificationsContext {
  notices: Notice[];
  source: NoticesSource;
  unread: number;
  open: boolean;
  setOpen: (open: boolean) => void;
  markRead: (ids: readonly string[] | "all") => void;
}

const Ctx = React.createContext<NotificationsContext | null>(null);

/** Running timers that have reached their end, by the same clock the island uses. */
function finished(timers: readonly Timer[], now: number): Timer[] {
  return timers.filter((t) => isRunning(t) && t.endsAt !== null && t.endsAt <= now);
}

/**
 * The notification centre's state (FR-SHELL-6). It also raises the first
 * real alert: a timer reaching zero. Each finished run is raised once per tab
 * (a set of keys) and once per account (the server's dedupe key), so two open
 * tabs record it once.
 */
export function NotificationsProvider({
  initial,
  source,
  children,
}: {
  initial: Notice[];
  source: NoticesSource;
  children: React.ReactNode;
}) {
  // Demo shows sample alerts, timed from when the shell loads.
  const [notices, setNotices] = React.useState(() =>
    source === "demo" ? demoNotices(Date.now(), demoMoneyAlerts(todayIn(DEFAULT_TIME_ZONE))) : initial,
  );
  const [open, setOpen] = React.useState(false);
  const timers = useActivity((s) => s.timers);
  const raised = React.useRef(new Set<string>());

  React.useEffect(() => {
    const raise = (t: Timer) => {
      if (t.endsAt === null) return;
      const n = timerDoneNotice({ id: t.id, label: t.label, endsAt: t.endsAt, totalMs: t.totalMs });
      if (raised.current.has(n.dedupeKey)) return;
      raised.current.add(n.dedupeKey);
      if (source === "demo") {
        setNotices((list) => addNotice(list, { ...n, id: n.dedupeKey, createdAt: Date.now(), readAt: null }));
        return;
      }
      void notifyTimerDone({ id: t.id, label: t.label, endsAt: t.endsAt, totalMs: t.totalMs })
        .then((r) => {
          if (r.ok) setNotices((list) => addNotice(list, r.notice));
        })
        .catch(() => {
          // Not recorded; the island still shows it. Retry on the next load.
          raised.current.delete(n.dedupeKey);
        });
    };

    // One handle for the whole chain, so cleanup always cancels the live one.
    let pending: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      clearTimeout(pending);
      const now = Date.now();
      for (const t of finished(timers, now)) raise(t);
      const next = Math.min(...timers.flatMap((t) => (isRunning(t) && t.endsAt !== null && t.endsAt > now ? [t.endsAt] : [])));
      pending = Number.isFinite(next) ? setTimeout(check, Math.max(0, next - now) + 50) : undefined;
    };
    check();
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(pending);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [timers, source]);

  // Reminders a subscription save raised (V31): shown without a reload.
  React.useEffect(
    () =>
      onNotices((list) => {
        setNotices((current) => mergeNotices(current, list));
      }),
    [],
  );

  const read = React.useCallback(
    (ids: readonly string[] | "all") => {
      setNotices((list) => markRead(list, ids, Date.now()));
      if (source === "demo") return;
      void markNotificationsRead(ids === "all" ? { all: true } : { ids: [...ids] }).catch(() => {
        // The list shows them read; the next load corrects it if the save failed.
      });
    },
    [source],
  );

  const value = React.useMemo(
    () => ({ notices, source, unread: unreadCount(notices), open, setOpen, markRead: read }),
    [notices, source, open, read],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNotifications(): NotificationsContext {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useNotifications needs a NotificationsProvider (the shell frame)");
  return ctx;
}
