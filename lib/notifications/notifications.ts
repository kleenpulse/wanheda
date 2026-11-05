import { formatDuration } from "@/lib/activity/timer";

// Notification centre rules (FR-SHELL-6), pure. Rows reach the client as
// plain objects with epoch-ms times, so the server and the demo seed share
// one shape.

export const NOTIFICATION_KINDS = ["timer", "money"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface Notice {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  href: string | null;
  /** What raised it once (`timer:…`, `sub:<id>:<on>:renew|trial`): money alerts read their date back from it. */
  dedupeKey: string;
  /** Epoch ms. */
  createdAt: number;
  /** Epoch ms, or null while unread. */
  readAt: number | null;
}

/** What a new alert carries before it has an id. */
export interface NewNotice {
  kind: NotificationKind;
  title: string;
  body: string | null;
  href: string | null;
  dedupeKey: string;
}

/** How many the centre keeps on screen. */
export const NOTICE_LIMIT = 50;
const MAX_LABEL = 80;

export function isNotificationKind(v: unknown): v is NotificationKind {
  return typeof v === "string" && (NOTIFICATION_KINDS as readonly string[]).includes(v);
}

/** A finished timer's alert. One per run: the key holds the end time, so +5 min and done again alerts again. */
export function timerDoneNotice(timer: { id: string; label: string; endsAt: number; totalMs: number }): NewNotice {
  const label = timer.label.trim().slice(0, MAX_LABEL) || `${formatDuration(timer.totalMs)} timer`;
  return { kind: "timer", title: "Timer done", body: label, href: null, dedupeKey: `timer:${timer.id}:${String(timer.endsAt)}` };
}

export function unreadCount(list: readonly Notice[]): number {
  return list.reduce((n, item) => n + (item.readAt === null ? 1 : 0), 0);
}

/** Marks the given ids (or all, when `ids` is "all") read at `now`. Already-read ones keep their time. */
export function markRead(list: readonly Notice[], ids: readonly string[] | "all", now: number): Notice[] {
  const pick = ids === "all" ? null : new Set(ids);
  return list.map((n) => (n.readAt === null && (pick === null || pick.has(n.id)) ? { ...n, readAt: now } : n));
}

/** The list without the given ids (deleted by the owner). */
export function removeNotices(list: readonly Notice[], ids: readonly string[]): Notice[] {
  const drop = new Set(ids);
  return list.filter((n) => !drop.has(n.id));
}

/** Newest first, capped. A notice already present (same id) is not added twice. */
export function addNotice(list: readonly Notice[], notice: Notice): Notice[] {
  if (list.some((n) => n.id === notice.id)) return [...list];
  return [notice, ...list].sort((a, b) => b.createdAt - a.createdAt).slice(0, NOTICE_LIMIT);
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "just now", "5 minutes ago", "yesterday", "3 days ago". */
export function relativeTime(at: number, now: number): string {
  const sec = Math.round((at - now) / 1000);
  if (Math.abs(sec) < 45) return "just now";
  const min = Math.round(sec / 60);
  if (Math.abs(min) < 60) return rtf.format(min, "minute");
  const hr = Math.round(min / 60);
  if (Math.abs(hr) < 24) return rtf.format(hr, "hour");
  return rtf.format(Math.round(hr / 24), "day");
}

/** Adds notices that arrived from elsewhere (a save, the shell's alert check), skipping ones already listed. */
export function mergeNotices(list: readonly Notice[], incoming: readonly Notice[]): Notice[] {
  let next = [...list];
  for (const n of incoming) next = addNotice(next, n);
  return next;
}

/** Demo mode's centre: clearly sample alerts, never saved. `extra`: demo's money alerts, from its seed. */
export function demoNotices(now: number, extra: readonly NewNotice[] = []): Notice[] {
  const list: Notice[] = [
    ...extra.map((n) => ({ ...n, id: `demo-${n.dedupeKey}`, createdAt: now - 60 * 60_000, readAt: null })),
    { id: "demo-1", kind: "timer", title: "Timer done", body: "Sample: 25 min focus", href: null, dedupeKey: "timer:demo-1", createdAt: now - 12 * 60_000, readAt: null },
    {
      id: "demo-2",
      kind: "timer",
      title: "Timer done",
      body: "Sample: 5 min tea",
      href: null,
      dedupeKey: "timer:demo-2",
      createdAt: now - 26 * 3_600_000,
      readAt: now - 25 * 3_600_000,
    },
  ];
  return list.sort((a, b) => b.createdAt - a.createdAt);
}
