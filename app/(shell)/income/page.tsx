import { Suspense } from "react";
import { IncomeApp } from "@/components/income/income-app";
import { Prefetch } from "@/components/providers/prefetch";
import { ModeText } from "@/components/shell/mode-text";
import { PageFrame } from "@/components/shell/page-frame";
import { INCOME_KEY } from "@/lib/saas/income";
import { incomeFor } from "@/lib/saas/income-server";

// Income (FRD §12.6, T42). The page awaits nothing, so a hop here paints at
// once from the client cache; the server read streams in beside it and
// refreshes the cache (SPEC V24).
export default function IncomePage() {
  return (
    <PageFrame
      title="Income"
      subtitle={<ModeText owner="MRR, customers and revenue from your products" demo="Demo: sample products and subscribers, nothing is stored" />}
    >
      <IncomeApp />
      <Suspense fallback={null}>
        <Prefetch queryKey={INCOME_KEY} load={incomeFor} />
      </Suspense>
    </PageFrame>
  );
}
