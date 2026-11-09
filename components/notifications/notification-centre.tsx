"use client";

import * as React from "react";
import { flushSync } from "react-dom";
import { Dialog } from "@base-ui/react/dialog";
import { Bell, CalendarClock, Check, CheckCheck, ExternalLink, Timer as TimerIcon, Trash2, TrendingUp, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useNotifications } from "@/components/notifications/notifications-provider";
import { EmptyState } from "@/components/shell/page-frame";
import { buttonClass } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { useNow } from "@/hooks/use-now";
import { relativeTime, type Notice, type NotificationKind } from "@/lib/notifications/notifications";
import { cn } from "@/lib/utils";

const ICONS: Record<NotificationKind, typeof Bell> = { timer: TimerIcon, money: CalendarClock, income: TrendingUp };
const FILTERS = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
] as const;
type Filter = (typeof FILTERS)[number]["value"];

/**
 * The notification centre (FR-SHELL-6): past alerts, newest first, with
 * read/unread. A side sheet on Base UI's dialog (focus trap, Escape, focus
 * returns to the opener). Opening it doesn't mark anything read: an alert is
 * read when it's opened, with its own "Mark read", or with "Mark all read".
 * Delete asks first, inline: the bin turns into "Delete? ✓ ✕".
 */
export function NotificationCentre() {
  const { notices, source, unread, open, setOpen, markRead } = useNotifications();
  const [filter, setFilter] = React.useState<Filter>("all");
  const shown = filter === "unread" ? notices.filter((n) => n.readAt === null) : notices;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next, details) => {
        // Escape inside a "Delete?" question cancels the question (NoticeList), not the sheet.
        const target = details.event.target;
        if (!next && details.reason === "escape-key" && target instanceof Element && target.closest("[data-confirm-delete]")) {
          details.cancel();
          return;
        }
        setOpen(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-background/40 backdrop-blur-[2px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          finalFocus={bellOrDefault}
          className={cn(
            "glass-window fixed top-[calc(var(--tb)+0.75rem)] right-3 bottom-3 z-50 flex w-[min(400px,calc(100vw-1.5rem))] flex-col rounded-card shadow-lift outline-none",
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

          <div className="min-h-0 flex-1 overflow-y-auto scroll-fade overscroll-contain px-2 py-3">
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
  const { setOpen, markRead, remove } = useNotifications();
  // The one row asking "Delete?", if any.
  const [confirming, setConfirming] = React.useState<string | null>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  const open = (n: Notice) => {
    onOpen(n);
    if (n.href) {
      setOpen(false);
      router.push(n.href as Route);
    }
  };

  // Focus moves in the same task as the commit: the dialog's focus trap sends
  // focus to the sheet itself as soon as the focused button is gone.
  const cancel = (id: string) => {
    flushSync(() => {
      setConfirming(null);
    });
    // Back to the bin it came from.
    listRef.current?.querySelector<HTMLElement>(`[data-delete="${CSS.escape(id)}"]`)?.focus();
  };

  const confirmDelete = (id: string) => {
    const ids = notices.map((n) => n.id);
    const at = ids.indexOf(id);
    const next = ids[at + 1] ?? ids[at - 1];
    flushSync(() => {
      setConfirming(null);
      remove([id]);
    });
    // The neighbouring row, so the keyboard isn't dropped (the sheet itself when it was the last).
    if (next) listRef.current?.querySelector<HTMLElement>(`[data-notice="${CSS.escape(next)}"]`)?.focus();
  };

  return (
    <ul ref={listRef} className="flex flex-col gap-1">
      {notices.map((n) => {
        const Icon = ICONS[n.kind];
        const unread = n.readAt === null;
        const asking = confirming === n.id;
        return (
          <li key={n.id} className="rounded-[16px] transition-colors hover:bg-card-nested focus-within:bg-card-nested">
            <button
              type="button"
              data-notice={n.id}
              onClick={() => {
                open(n);
              }}
              className="flex w-full items-start gap-3 rounded-[16px] px-2.5 pt-2.5 pb-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-card-nested text-ink-2">
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

            <div className="flex h-9 items-center gap-0.5 pr-2.5 pb-1.5 pl-[3.25rem]">
              {asking ? (
                <div
                  role="group"
                  data-confirm-delete
                  aria-label={`Delete “${n.title}”?`}
                  className="flex items-center gap-0.5"
                  onKeyDown={(e) => {
                    if (e.key !== "Escape") return;
                    // Escape cancels the question, not the whole sheet.
                    e.stopPropagation();
                    cancel(n.id);
                  }}
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget)) setConfirming(null);
                  }}
                >
                  <span className="pr-1.5 text-[12.5px] text-ink-2">Delete?</span>
                  <RowAction
                    label="Delete"
                    tone="danger"
                    onClick={() => {
                      confirmDelete(n.id);
                    }}
                  >
                    <Check aria-hidden />
                  </RowAction>
                  <RowAction
                    label="Keep"
                    autoFocus
                    onClick={() => {
                      cancel(n.id);
                    }}
                  >
                    <X aria-hidden />
                  </RowAction>
                </div>
              ) : (
                <>
                  {n.href ? (
                    <RowAction
                      label="Open"
                      onClick={() => {
                        open(n);
                      }}
                    >
                      <ExternalLink aria-hidden />
                    </RowAction>
                  ) : null}
                  {unread ? (
                    <RowAction
                      label="Mark read"
                      onClick={() => {
                        markRead([n.id]);
                      }}
                    >
                      <CheckCheck aria-hidden />
                    </RowAction>
                  ) : null}
                  <RowAction
                    label="Delete"
                    data-delete={n.id}
                    onClick={() => {
                      setConfirming(n.id);
                    }}
                  >
                    <Trash2 aria-hidden />
                  </RowAction>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** A small icon action under a notice. `danger`: the confirming tick, a destructive tint on a same-hue fill. */
function RowAction({
  label,
  tone = "plain",
  children,
  ...props
}: Omit<React.ComponentProps<"button">, "aria-label" | "type"> & { label: string; tone?: "plain" | "danger" }) {
  return (
    <button
      {...props}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "grid size-7 place-items-center rounded-full outline-none transition-[background-color,color,transform] duration-150 active:scale-90 focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3.5",
        tone === "danger" ? "bg-destructive/12 text-destructive hover:bg-destructive/20" : "text-ink-3 hover:bg-muted hover:text-foreground dark:hover:bg-muted/50",
      )}
    >
      {children}
    </button>
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
