import { Suspense } from "react";
import { cookies } from "next/headers";
import { after } from "next/server";
import { PAGE_COLUMN } from "@/components/shell/page-frame";
import { ShellFrame } from "@/components/shell/shell-frame";
import { requireOwner } from "@/lib/auth/owner";
import { raiseBudgetAlerts, raiseMoneyAlerts } from "@/lib/money/alerts";
import { mergeNotices, type Notice } from "@/lib/notifications/notifications";
import { loadNotices } from "@/lib/notifications/store";
import { PREFS_COOKIE, decodePrefs } from "@/lib/prefs/prefs";
import { loadPrefs } from "@/lib/prefs/store";
import type { ReaderPrefs } from "@/lib/reader/prefs";
import { DEMO_ACCOUNT, type ShellAccount } from "@/lib/shell/account";
import { RAIL_COOKIE, parseRail } from "@/lib/shell/rail";
import type { NoticesSource } from "@/components/notifications/notifications-provider";
import type { PrefsSource } from "@/components/prefs/prefs-provider";
import { cn } from "@/lib/utils";

// Every page in the shell is behind requireOwner(). It reads the request, so
// it sits inside Suspense (Cache Components, SPEC V16). The rail's width comes
// from a cookie read here, so the first streamed paint is already right.
export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <OwnerShell>{children}</OwnerShell>
    </Suspense>
  );
}

async function OwnerShell({ children }: { children: React.ReactNode }) {
  const owner = await requireOwner();
  const jar = await cookies();
  const account: ShellAccount =
    owner.kind === "owner"
      ? { kind: "owner", id: owner.user.id, name: owner.user.name || owner.user.email, email: owner.user.email, admin: owner.admin }
      : DEMO_ACCOUNT;

  // Prefs and alerts: the owner's from the database (either read failing falls back,
  // never throws); demo has this device's cookie and sample alerts.
  const devicePrefs = decodePrefs(jar.get(PREFS_COOKIE)?.value);
  let prefs: { initial: typeof devicePrefs; source: PrefsSource; reader: Partial<ReaderPrefs> | null } = { initial: devicePrefs, source: "demo", reader: null };
  // Demo samples are stamped on the client (NotificationsProvider), not here.
  let notices: { initial: Notice[]; source: NoticesSource } = { initial: [], source: "demo" };
  if (owner.kind === "owner") {
    // Subscription reminders due today are raised beside the read (V31), so
    // they show in this very load; each is raised once, whichever check wins.
    const [p, n, alerts] = await Promise.all([loadPrefs(owner.user.id), loadNotices(owner.user.id), raiseMoneyAlerts(owner.user.id)]);
    prefs = p.kind === "loaded" ? { initial: p.prefs, source: "owner", reader: p.reader } : { initial: devicePrefs, source: "load-failed", reader: null };
    // Budgets read two months of entries (and maybe fetch FX): after the reply,
    // off the shell's critical path; a txn save checks them inline (V31).
    const userId = owner.user.id;
    after(() => raiseBudgetAlerts(userId, { fetchRates: true }));
    notices = { initial: mergeNotices(n.notices, alerts), source: n.kind === "loaded" ? "owner" : "load-failed" };
  }

  return (
    <ShellFrame account={account} initialExpanded={parseRail(jar.get(RAIL_COOKIE)?.value)} prefs={prefs} notices={notices}>
      {children}
    </ShellFrame>
  );
}

// Static, so it cannot read the cookie itself: the <head> boot script sets
// html[data-rail=open] before first paint (lib/shell/rail.ts), and the band and
// `--rail-w` follow it, so the real shell streams in at the same width
// (FR-SHELL-1). Same geometry as ShellFrame + NavRail.
function ShellFallback() {
  return (
    <div
      // data-shell: the document keeps its scrollbar's room under the shell (globals.css), fallback included.
      data-shell
      className="relative flex min-h-(--app-h) w-full shrink-0 [--rail-w:0px] md:[--rail-w:84px] md:[html[data-rail=open]_&]:[--rail-w:232px]"
      aria-busy
    >
      <div
        aria-hidden
        data-rail-skeleton
        className="sticky top-(--tb) hidden h-(--app-h) w-[84px] shrink-0 bg-band px-5 py-5 md:block dark:border-r dark:border-rail-border [html[data-rail=open]_&]:w-[232px]"
      >
        <div className="size-11 rounded-full bg-card-nested" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className={cn(PAGE_COLUMN, "pt-6 pb-6")}>
          <div className="h-[27px] w-32 rounded-pill bg-card-nested" />
          <div className="mt-2 h-3.5 w-48 rounded-pill bg-card-nested opacity-70" />
        </div>
        <div className="flex-1 rounded-t-frame bg-sheet dark:border-t dark:border-glass-border" />
      </div>
    </div>
  );
}
