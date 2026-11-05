"use client";

import * as React from "react";
import type { Day } from "@/lib/money/dates";
import { parsePeriod, periodParam, type Period } from "@/lib/money/periods";

// The money period lives in `?p=` (SPEC T35), so a reload or a shared link
// opens the same view. Read straight from the location rather than through
// useSearchParams, which would put a Suspense boundary in front of the page's
// first paint (V24); the server render is always this month. Written with
// replaceState: changing the period is not a page to go back through.

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("popstate", onChange);
  };
}

const readParam = () => new URLSearchParams(window.location.search).get("p");
const serverParam = () => null;

export function usePeriod(today: Day): [Period, (next: Period) => void] {
  const param = React.useSyncExternalStore(subscribe, readParam, serverParam);
  const period = React.useMemo(() => parsePeriod(param, today), [param, today]);
  const setPeriod = React.useCallback(
    (next: Period) => {
      const url = new URL(window.location.href);
      const value = periodParam(next, today);
      if (value) url.searchParams.set("p", value);
      else url.searchParams.delete("p");
      // Next.js syncs its router with native history calls.
      window.history.replaceState(null, "", url);
      for (const l of listeners) l();
    },
    [today],
  );
  return [period, setPeriod];
}
