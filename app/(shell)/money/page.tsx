import { Suspense } from "react";
import { MoneyApp } from "@/components/money/money-app";
import { Prefetch } from "@/components/providers/prefetch";
import { ModeText } from "@/components/shell/mode-text";
import { PageFrame } from "@/components/shell/page-frame";
import { MONEY_KEY } from "@/lib/money/money";
import { moneyFor } from "@/lib/money/server";

// Money (FRD 6.3). The page awaits nothing, so a hop here paints at once from
// the client cache; the ledger window streams in beside it and refreshes the
// cache (SPEC V24).
export default function MoneyPage() {
  return (
    <PageFrame
      title="Money"
      subtitle={<ModeText owner="Spending and income, in your currencies" demo="Demo: sample spending, changes stay in this tab" />}
    >
      <MoneyApp />
      <Suspense fallback={null}>
        <Prefetch queryKey={MONEY_KEY} load={moneyFor} />
      </Suspense>
    </PageFrame>
  );
}
