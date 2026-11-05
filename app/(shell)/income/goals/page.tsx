import { Suspense } from "react";
import { GoalsView } from "@/components/income/goals-view";
import { Prefetch } from "@/components/providers/prefetch";
import { MONEY_KEY } from "@/lib/money/money";
import { moneyFor } from "@/lib/money/server";

// MRR and savings goals with progress and a projection (T43). Cash comes from
// the money cache; its read streams in beside the view.
export default function IncomeGoalsPage() {
  return (
    <>
      <GoalsView />
      <Suspense fallback={null}>
        <Prefetch queryKey={MONEY_KEY} load={moneyFor} />
      </Suspense>
    </>
  );
}
