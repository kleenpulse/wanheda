import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { Notice } from "@/components/income/parts";
import { PageFrame } from "@/components/shell/page-frame";
import { loadAdminStats } from "@/lib/admin/stats";
import { requireAdmin } from "@/lib/auth/owner";

export const metadata: Metadata = { title: "Admin · Wanheda" };

// Users and usage, for the accounts in ADMIN_EMAILS (ADR-0015). Everyone else
// gets the not-found page before any of this page renders. The gate reuses
// the shell's per-request owner decision, so it costs nothing; the counts
// stream in behind their own Suspense.
export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <AdminGate />
    </Suspense>
  );
}

async function AdminGate() {
  await requireAdmin();
  return (
    <PageFrame title="Admin" subtitle="Who uses Wanheda, and which apps they use">
      <Suspense fallback={<StatsFallback />}>
        <Stats />
      </Suspense>
    </PageFrame>
  );
}

async function Stats() {
  const result = await loadAdminStats();
  if (result.kind === "no-db") return <Notice>No database is set up, so there are no users to count.</Notice>;
  if (result.kind === "failed") return <Notice>The numbers couldn&apos;t be read just now. Reload to try again.</Notice>;
  return <AdminDashboard stats={result.stats} />;
}

function StatsFallback() {
  return (
    <div aria-busy className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2.5 @3xl/main:grid-cols-4 @3xl/main:gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="bento h-[104px] opacity-60" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 @4xl/main:grid-cols-2">
        <div className="bento h-[260px] opacity-50" />
        <div className="bento h-[260px] opacity-50" />
      </div>
    </div>
  );
}
