"use client";

import * as React from "react";
import type { Day } from "@/lib/money/dates";
import { filterParam, parseFilter, type MoneyFilter } from "@/lib/money/list-filter";
import { parsePeriod, periodParam, type Period } from "@/lib/money/periods";

// The money period lives in `?p=` (SPEC T35) and the entries filter in `?f=`,
// so a reload or a shared link opens the same view, and the entries and
// analytics pages share the period. Read straight from the location rather
// than through useSearchParams, which would put a Suspense boundary in front
// of the page's first paint (V24); the server render is always this month,
// unfiltered. Written with replaceState: changing the period or clearing a
// filter is not a page to go back through.

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("popstate", onChange);
  };
}

const serverParam = () => null;

function useParam(name: string): string | null {
  const read = React.useCallback(() => new URLSearchParams(window.location.search).get(name), [name]);
  return React.useSyncExternalStore(subscribe, read, serverParam);
}

function replaceParams(patch: Readonly<Record<string, string | null>>) {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  // Next.js syncs its router with native history calls.
  window.history.replaceState(null, "", url);
  for (const l of listeners) l();
}

/** The period in `?p=`. Setting one clears the entries filter, which belonged to the old period. */
export function usePeriod(today: Day): [Period, (next: Period) => void] {
  const param = useParam("p");
  const period = React.useMemo(() => parsePeriod(param, today), [param, today]);
  const setPeriod = React.useCallback(
    (next: Period) => {
      replaceParams({ p: periodParam(next, today) || null, f: null });
    },
    [today],
  );
  return [period, setPeriod];
}

/** The entries filter in `?f=`, set by a breakdown row on the analytics page. */
export function useListFilter(): [MoneyFilter | null, () => void] {
  const param = useParam("f");
  const filter = React.useMemo(() => parseFilter(param), [param]);
  const clear = React.useCallback(() => {
    replaceParams({ f: null });
  }, []);
  return [filter, clear];
}

/** The raw `?p=`, for links that carry the period to the other money page. */
export function usePeriodParam(): string | null {
  return useParam("p");
}

/** The entries page filtered to one breakdown row, in the period shown. */
export function entriesHref(period: Period, today: Day, filter: MoneyFilter): string {
  const q = new URLSearchParams();
  const p = periodParam(period, today);
  if (p) q.set("p", p);
  q.set("f", filterParam(filter));
  return `/money?${q.toString()}`;
}
