"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount } from "@/components/shell/account";
import { createMoneyRuntime, useMoneyLocal, type MoneyRuntime } from "./money-runtime";

// The money runtime for the whole shell (see money-runtime.ts): one outbox
// per tab, draining from any page, so the palette's quick-add is sent even
// when /money was never opened.

const Ctx = React.createContext<MoneyRuntime | null>(null);

export function MoneyProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const demo = useAccount().kind !== "owner";
  const runtime = React.useMemo(() => createMoneyRuntime(qc, demo), [qc, demo]);
  React.useEffect(() => runtime.start(), [runtime]);
  return <Ctx.Provider value={runtime}>{children}</Ctx.Provider>;
}

export function useMoneyRuntime(): MoneyRuntime {
  const runtime = React.useContext(Ctx);
  if (!runtime) throw new Error("useMoneyRuntime() outside MoneyProvider");
  return runtime;
}

/** For the sync chip: money writes waiting in the outbox, across tabs. */
export function useMoneySync(): number {
  return useMoneyLocal((s) => s.queued);
}
