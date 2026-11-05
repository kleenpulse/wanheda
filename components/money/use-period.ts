"use client";

import * as React from "react";
import { replaceUrlParams, useUrlParam } from "@/hooks/use-url-param";
import type { Day } from "@/lib/money/dates";
import { filterParam, parseFilter, type MoneyFilter } from "@/lib/money/list-filter";
import { parsePeriod, periodParam, type Period } from "@/lib/money/periods";

// The money period lives in `?p=` (SPEC T35) and the entries filter in `?f=`,
// so a reload or a shared link opens the same view, and the entries and
// analytics pages share the period (hooks/use-url-param.ts). The server render
// is always this month, unfiltered.

/** The period in `?p=`. Setting one clears the entries filter, which belonged to the old period. */
export function usePeriod(today: Day): [Period, (next: Period) => void] {
  const param = useUrlParam("p");
  const period = React.useMemo(() => parsePeriod(param, today), [param, today]);
  const setPeriod = React.useCallback(
    (next: Period) => {
      replaceUrlParams({ p: periodParam(next, today) || null, f: null });
    },
    [today],
  );
  return [period, setPeriod];
}

/** The entries filter in `?f=`, set by a breakdown row on the analytics page. */
export function useListFilter(): [MoneyFilter | null, () => void] {
  const param = useUrlParam("f");
  const filter = React.useMemo(() => parseFilter(param), [param]);
  const clear = React.useCallback(() => {
    replaceUrlParams({ f: null });
  }, []);
  return [filter, clear];
}

/** The raw `?p=`, for links that carry the period to the other money page. */
export function usePeriodParam(): string | null {
  return useUrlParam("p");
}

/** The entries page filtered to one breakdown row, in the period shown. */
export function entriesHref(period: Period, today: Day, filter: MoneyFilter): string {
  const q = new URLSearchParams();
  const p = periodParam(period, today);
  if (p) q.set("p", p);
  q.set("f", filterParam(filter));
  return `/money?${q.toString()}`;
}
