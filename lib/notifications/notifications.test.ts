import { describe, expect, it } from "vitest";
import { MINUTE } from "@/lib/activity/timer";
import {
  NOTICE_LIMIT,
  addNotice,
  demoNotices,
  markRead,
  relativeTime,
  removeNotices,
  timerDoneNotice,
  unreadCount,
  type Notice,
} from "./notifications";

const T0 = 1_800_000_000_000;

function notice(id: string, createdAt: number, readAt: number | null = null): Notice {
  return { id, kind: "timer", title: "Timer done", body: id, href: null, dedupeKey: `timer:${id}`, createdAt, readAt };
}

describe("timerDoneNotice", () => {
  it("names the timer and keys the run by its end time", () => {
    const n = timerDoneNotice({ id: "t1", label: "25 min timer", endsAt: T0, totalMs: 25 * MINUTE });
    expect(n).toEqual({ kind: "timer", title: "Timer done", body: "25 min timer", href: null, dedupeKey: `timer:t1:${String(T0)}` });
  });

  it("alerts again after time is added and the timer ends again", () => {
    const first = timerDoneNotice({ id: "t1", label: "x", endsAt: T0, totalMs: MINUTE });
    const again = timerDoneNotice({ id: "t1", label: "x", endsAt: T0 + 5 * MINUTE, totalMs: 6 * MINUTE });
    expect(first.dedupeKey).not.toBe(again.dedupeKey);
  });

  it("caps a long label and falls back when it is blank", () => {
    expect(timerDoneNotice({ id: "t", label: "x".repeat(500), endsAt: T0, totalMs: MINUTE }).body).toHaveLength(80);
    expect(timerDoneNotice({ id: "t", label: "  ", endsAt: T0, totalMs: 5 * MINUTE }).body).toBe("5 min timer");
  });
});

describe("read state", () => {
  const list = [notice("a", T0), notice("b", T0 - 1), notice("c", T0 - 2, T0 - 1)];

  it("counts unread", () => {
    expect(unreadCount(list)).toBe(2);
  });

  it("marks the chosen ones, or all, and keeps an earlier read time", () => {
    expect(unreadCount(markRead(list, ["a"], T0 + 1))).toBe(1);
    const all = markRead(list, "all", T0 + 1);
    expect(unreadCount(all)).toBe(0);
    expect(all.find((n) => n.id === "c")?.readAt).toBe(T0 - 1);
  });
});

describe("addNotice", () => {
  it("puts the newest first, skips a repeat, and caps the list", () => {
    const list = [notice("a", T0)];
    expect(addNotice(list, notice("b", T0 + 1)).map((n) => n.id)).toEqual(["b", "a"]);
    expect(addNotice(list, notice("a", T0 + 9))).toHaveLength(1);
    const full = Array.from({ length: NOTICE_LIMIT }, (_, i) => notice(String(i), T0 - i));
    expect(addNotice(full, notice("new", T0 + 1))).toHaveLength(NOTICE_LIMIT);
  });
});

describe("removeNotices", () => {
  it("drops the given ids and keeps the order of the rest", () => {
    const list = [notice("c", T0 + 2), notice("b", T0 + 1), notice("a", T0)];
    expect(removeNotices(list, ["b"]).map((n) => n.id)).toEqual(["c", "a"]);
    expect(removeNotices(list, ["zz"]).map((n) => n.id)).toEqual(["c", "b", "a"]);
    expect(removeNotices(list, [])).toEqual(list);
  });
});

describe("relativeTime", () => {
  it("reads like a person would say it", () => {
    expect(relativeTime(T0 - 10_000, T0)).toBe("just now");
    expect(relativeTime(T0 - 5 * MINUTE, T0)).toBe("5 minutes ago");
    expect(relativeTime(T0 - 3 * 60 * MINUTE, T0)).toBe("3 hours ago");
    expect(relativeTime(T0 - 24 * 60 * MINUTE, T0)).toBe("yesterday");
  });
});

describe("demoNotices", () => {
  it("is labelled sample data, one unread", () => {
    const list = demoNotices(T0);
    expect(list.every((n) => n.body?.startsWith("Sample"))).toBe(true);
    expect(unreadCount(list)).toBe(1);
  });
});
