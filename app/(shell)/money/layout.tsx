import { Suspense } from "react";
import { MoneyTabs } from "@/components/money/money-tabs";
import { Prefetch } from "@/components/providers/prefetch";
import { ModeText } from "@/components/shell/mode-text";
import { PageFrame } from "@/components/shell/page-frame";
import { MONEY_KEY } from "@/lib/money/money";
import { moneyFor } from "@/lib/money/server";

// Money (FRD 6.3): entries, analytics and subscriptions, pages over one cache. The
// layout awaits nothing, so a hop here or between them paints at once from
// the client cache; the ledger window streams in beside it and refreshes the
// cache (SPEC V24). It stays mounted across the pages, so the tab pill
// at the header's right end slides and the read is not repeated.
export default function MoneyLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageFrame
      title="Money"
      subtitle={<ModeText owner="Spending and income, in your currencies" demo="Demo: sample spending, changes stay in this tab" />}
      actions={<MoneyTabs />}
    >
      {children}
      <Suspense fallback={null}>
        <Prefetch queryKey={MONEY_KEY} load={moneyFor} />
      </Suspense>
    </PageFrame>
  );
}
