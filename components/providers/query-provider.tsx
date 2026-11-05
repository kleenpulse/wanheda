"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * TanStack Query for the shell (ADR-0008): reads are prefetched on the server
 * and hydrated, then kept fresh here. One client per shell mount, never one
 * per render. A 30 s stale time keeps a server-prefetched list from being
 * fetched again on hydration.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
