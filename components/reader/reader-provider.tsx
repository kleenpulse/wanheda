"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount } from "@/components/shell/account";
import { createReaderRuntime, type ReaderRuntime } from "./reader-runtime";

// The reader runtime for the whole shell (see reader-runtime.ts): queued
// reading positions drain from any page, and the device's copy of the
// library is painted before the server answers.

const Ctx = React.createContext<ReaderRuntime | null>(null);

export function ReaderProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const demo = useAccount().kind !== "owner";
  const runtime = React.useMemo(() => createReaderRuntime(qc, demo), [qc, demo]);
  React.useEffect(() => runtime.start(), [runtime]);
  return <Ctx.Provider value={runtime}>{children}</Ctx.Provider>;
}

export function useReaderRuntime(): ReaderRuntime {
  const runtime = React.useContext(Ctx);
  if (!runtime) throw new Error("useReaderRuntime() outside ReaderProvider");
  return runtime;
}
