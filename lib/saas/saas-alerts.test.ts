import { describe, expect, it } from "vitest";
import type { Notice } from "@/lib/notifications/notifications";
import { parseSaasKey, saasAlertsFrom } from "./saas-alerts";

const NOW = Date.UTC(2026, 10, 5, 12);
const HOUR = 3_600_000;
const notice = (over: Partial<Notice>): Notice => ({
  id: "n",
  kind: "income",
  title: "New customer",
  body: "rawstash",
  href: "/income",
  dedupeKey: "saas:p1:new:c1",
  createdAt: NOW - HOUR,
  readAt: null,
  ...over,
});

describe("saasAlertsFrom", () => {
  it("unread income notices of the last 48 h, newest first", () => {
    const alerts = saasAlertsFrom(
      [
        notice({ id: "a", createdAt: NOW - 2 * HOUR }),
        notice({ id: "b", dedupeKey: "saas:all:mrr:USD1000", createdAt: NOW - HOUR }),
        notice({ id: "read", readAt: NOW }),
        notice({ id: "old", createdAt: NOW - 49 * HOUR }),
        notice({ id: "money", kind: "money", dedupeKey: "saas:p1:new:c9" }),
        notice({ id: "odd", dedupeKey: "saas:p1:refund:x" }),
      ],
      NOW,
    );
    expect(alerts.map((a) => [a.notice.id, a.type, a.scope])).toEqual([
      ["b", "mrr", "all"],
      ["a", "new", "p1"],
    ]);
  });

  it("reads every V37 key shape", () => {
    expect(parseSaasKey("saas:p1:churn:c1:2026-11-05")).toEqual({ scope: "p1", type: "churn" });
    expect(parseSaasKey("saas:p1:failed:sub_1:2026-11-05T10:00:00.000Z")).toEqual({ scope: "p1", type: "failed" });
    expect(parseSaasKey("sub:x:2026-11-05:renew")).toBeNull();
  });
});
