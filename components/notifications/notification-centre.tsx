"use client";

import * as React from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Bell, CalendarClock, CheckCheck, Timer as TimerIcon, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useNotifications } from "@/components/notifications/notifications-provider";
import { EmptyState } from "@/components/shell/page-frame";
import { buttonClass } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { useNow } from "@/hooks/use-now";
import { relativeTime, type Notice, type NotificationKind } from "@/lib/notifications/notifications";
import { cn } from "@/lib/utils";

const ICONS: Record<NotificationKind, typeof Bell> = { timer: TimerIcon, money: CalendarClock };
const FILTERS = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
] as const;
type Filter = (typeof FILTERS)[number]["value"];

/**
 * The notification centre (FR-SHELL-6): past alerts, newest first, with
 * read/unread. A side sheet on Base UI's dialog (focus trap, Escape, focus
 * returns to the opener). Opening it doesn't mark anything read: an alert is
 * read when it's opened, or with "Mark all read".
 */
export function NotificationCentre() {
  const { notices, source, unread, open, setOpen, markRead } = useNotifications();
  const [filter, setFilter] = React.useState<Filter>("all");
  const shown = filter === "unread" ? notices.filter((n) => n.readAt === null) : notices;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-background/40 backdrop-blur-[2px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          finalFocus={bellOrDefault}
          className={cn(
            "glass-window fixed top-3 right-3 bottom-3 z-50 flex w-[min(400px,calc(100vw-1.5rem))] flex-col rounded-card shadow-lift outline-none",
            "transition-[opacity,translate] duration-200 ease-out-quint data-ending-style:translate-x-4 data-ending-style:opacity-0 data-starting-style:translate-x-4 data-starting-style:opacity-0 motion-reduce:translate-x-0",
          )}
        >
          <header className="flex items-center gap-2 border-b border-border px-4 py-3 dark:border-glass-border">
            <Dialog.Title className="flex min-w-0 flex-1 items-baseline gap-2 font-display text-[17px] leading-tight text-foreground">
              Notifications
              {unread > 0 ? <span className="readout tabular">{unread} unread</span> : null}
            </Dialog.Title>
            <button
              type="button"
              disabled={unread === 0}
              onClick={() => {
                markRead("all");
              }}
              className={buttonClass("ghost", "pill-sm")}
            >
              <CheckCheck aria-hidden />
              Mark all read
            </button>
            <Dialog.Close aria-label="Close notifications" className={buttonClass("ghost", "circle-sm", "size-8")}>
              <X aria-hidden />
            </Dialog.Close>
          </header>

          <div className="flex items-center justify-between gap-3 px-4 pt-3">
            <Segmented label="Show" value={filter} options={FILTERS} onChange={setFilter} />
            {source === "demo" ? <span className="readout">Sample alerts</span> : null}
          </div>

          {source === "load-failed" ? (
            <p role="alert" className="mx-4 mt-3 rounded-[14px] bg-card-nested px-3 py-2 text-[13px] text-ink-2 ring-1 ring-border dark:ring-glass-border">
              Couldn&rsquo;t load your notifications. New ones still arrive here.
            </p>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3">
            {shown.length === 0 ? (
              <EmptyState
                title={filter === "unread" ? "All caught up" : "Nothing yet"}
                body={filter === "unread" ? "No unread alerts." : "Finished timers and subscription reminders land here."}
              />
            ) : (
              <NoticeList notices={shown} onOpen={(n) => {
                markRead([n.id]);
              }} />
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function NoticeList({ notices, onOpen }: { notices: Notice[]; onOpen: (n: Notice) => void }) {
  const now = useNow(60_000);
  const router = useRouter();
  const { setOpen } = useNotifications();

  return (
    <ul className="flex flex-col gap-1">
      {notices.map((n) => {
        const Icon = ICONS[n.kind];
        const unread = n.readAt === null;
        return (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => {
                onOpen(n);
                if (n.href) {
                  setOpen(false);
                  router.push(n.href as Route);
                }
              }}
              className="flex w-full items-start gap-3 rounded-[16px] px-2.5 py-2.5 text-left outline-none hover:bg-card-nested focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-card-nested text-ink-2 ring-1 ring-border dark:ring-glass-border">
                <Icon aria-hidden className="size-4" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-[13.5px]", unread ? "font-semibold text-foreground" : "text-ink-2")}>
                  {n.title}
                </span>
                {n.body ? <span className="block truncate text-[12.5px] text-ink-2">{n.body}</span> : null}
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
                <span className="tabular text-[11.5px] text-ink-3">{now === null ? "" : relativeTime(n.createdAt, now)}</span>
                <span
                  aria-hidden
                  className={cn("size-2 rounded-full", unread ? "bg-signal" : "bg-transparent")}
                />
                {unread ? <span className="sr-only">Unread</span> : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Where focus goes on close. Opened from the palette, the opener is gone, so
 * land on the bell when it is on screen (desktop); otherwise Base UI's default.
 */
function bellOrDefault(): HTMLElement | true {
  const bell = document.querySelector<HTMLElement>("[data-notification-bell]");
  return bell && bell.offsetParent !== null ? bell : true;
}

/** The rail's bell: opens the centre, with the unread count. */
export function NotificationBell({
  circleClass,
  labelClass,
  ...props
}: React.ComponentProps<"button"> & { circleClass: string; labelClass: string }) {
  const { unread, setOpen } = useNotifications();
  const name = unread > 0 ? `Notifications, ${String(unread)} unread` : "Notifications";
  return (
    // Spread first: a tooltip that renders through this button passes its trigger props and ref.
    <button
      {...props}
      type="button"
      data-notification-bell
      aria-label={name}
      onClick={(e) => {
        props.onClick?.(e);
        setOpen(true);
      }}
      className="group flex items-center gap-3 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className={circleClass}>
        <Bell strokeWidth={1.75} aria-hidden />
        {unread > 0 ? (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground tabular"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </span>
      <span aria-hidden className={labelClass}>
        Notifications
      </span>
    </button>
  );
}
