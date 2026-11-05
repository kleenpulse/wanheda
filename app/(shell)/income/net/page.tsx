import { Suspense } from "react";
import { NetView } from "@/components/income/net-view";
import { Prefetch } from "@/components/providers/prefetch";
import { MONEY_KEY } from "@/lib/money/money";
import { moneyFor } from "@/lib/money/server";

// Ledger income − spending per month, savings rate and runway (T43). The
// ledger comes from the money cache; its own read streams in beside the view.
export default function IncomeNetPage() {
  return (
    <>
      <NetView />
      <Suspense fallback={null}>
        <Prefetch queryKey={MONEY_KEY} load={moneyFor} />
      </Suspense>
    </>
  );
}
