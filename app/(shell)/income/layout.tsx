import { Suspense } from "react";
import { IncomeTabs } from "@/components/income/income-tabs";
import { Prefetch } from "@/components/providers/prefetch";
import { ModeText } from "@/components/shell/mode-text";
import { PageFrame } from "@/components/shell/page-frame";
import { INCOME_KEY } from "@/lib/saas/income";
import { incomeFor } from "@/lib/saas/income-server";

// Income (FRD §12.6, T42, T43): products, net and goals, pages over the income
// cache. The layout awaits nothing, so a hop here or between the pages paints
// at once from the client cache; the server read streams in beside it and
// refreshes the cache (SPEC V24). It stays mounted across the pages, so the
// tab pill slides and the read is not repeated.
export default function IncomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageFrame
      title="Income"
      subtitle={<ModeText owner="MRR, customers, revenue and goals" demo="Demo: sample products and subscribers, nothing is stored" />}
      actions={<IncomeTabs />}
    >
      {children}
      <Suspense fallback={null}>
        <Prefetch queryKey={INCOME_KEY} load={incomeFor} />
      </Suspense>
    </PageFrame>
  );
}
