import type { Notice } from "@/lib/notifications/notifications";
import { ALERT_WINDOW_MS } from "./alerts";

// The island's `saas-alert` (FR-INCOME-11, V37), pure: derived from the same
// unread `income` notices the centre shows, so the two never disagree. An
// alert stays on the island until it is dismissed (marked read) or is more
// than 48 h old; the centre keeps it after that.

export type SaasAlertType = "new" | "churn" | "failed" | "mrr";

export interface SaasAlert {
  notice: Notice;
  type: SaasAlertType;
  /** The product id, or "all" for an overall milestone. */
  scope: string;
}

const TYPES: ReadonlySet<string> = new Set<SaasAlertType>(["new", "churn", "failed", "mrr"]);

/** `saas:<product|all>:<type>:…` (V37), or null for anything else. */
export function parseSaasKey(key: string): { scope: string; type: SaasAlertType } | null {
  const [prefix, scope, type] = key.split(":");
  if (prefix !== "saas" || !scope || !type || !TYPES.has(type)) return null;
  return { scope, type: type as SaasAlertType };
}

/** Live income alerts, newest first. */
export function saasAlertsFrom(notices: readonly Notice[], now: number): SaasAlert[] {
  const out: SaasAlert[] = [];
  for (const notice of notices) {
    if (notice.kind !== "income" || notice.readAt !== null) continue;
    if (notice.createdAt <= now - ALERT_WINDOW_MS || notice.createdAt > now + 60_000) continue;
    const key = parseSaasKey(notice.dedupeKey);
    if (key) out.push({ notice, ...key });
  }
  return out.sort((a, b) => b.notice.createdAt - a.notice.createdAt);
}
