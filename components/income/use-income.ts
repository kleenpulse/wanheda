"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount } from "@/components/shell/account";
import { useHydrated } from "@/hooks/use-hydrated";
import { useNow } from "@/hooks/use-now";
import { replaceUrlParams, useUrlParam } from "@/hooks/use-url-param";
import { fetchJson } from "@/lib/fetch-json";
import { INCOME_KEY, RANGES, toFacts, type Facts, type IncomePayload, type IncomeRange } from "@/lib/saas/income";

// The income cache (V24): the /income views and Home's income widgets read one
// TanStack Query entry, filled by the page's Prefetch or by /api/income. A hop
// back paints from it at once; the server read refreshes it in the background.

/** The income payload, or null before the first load. */
export function useIncome(options: { enabled?: boolean } = {}) {
  const demo = useAccount().kind !== "owner";
  const query = useQuery({
    queryKey: INCOME_KEY,
    queryFn: () => fetchJson<IncomePayload>("/api/income"),
    // Demo's figures are the seed: nothing to pull.
    staleTime: demo ? Infinity : 60_000,
    enabled: options.enabled ?? true,
  });
  // A sibling Prefetch may fill the cache before this view's hydration pass;
  // painting it there would not match the server (B15). Hops never hydrate.
  const hydrated = useHydrated();
  const data = hydrated ? (query.data ?? null) : null;
  return { data, failed: hydrated && query.isError && !query.data, refetch: query.refetch };
}

/** Movements as engine facts, parsed once per payload. */
export function useFacts(payload: IncomePayload): { facts: Facts[]; unknown: string[] } {
  return React.useMemo(() => toFacts(payload.movements), [payload.movements]);
}

/** Now, moving on each minute; the first client render reads the clock directly. */
export function useIncomeNow(): Date {
  const now = useNow(60_000);
  return React.useMemo(() => (now === null ? new Date() : new Date(now)), [now]);
}

/** The product in view (`?product=`), null for every product. An unknown id reads as every product. */
export function useProductParam(known: readonly { id: string }[]): [string | null, (id: string | null) => void] {
  const param = useUrlParam("product");
  const id = param && known.some((p) => p.id === param) ? param : null;
  const set = React.useCallback((next: string | null) => {
    replaceUrlParams({ product: next, currency: null });
  }, []);
  return [id, set];
}

/** The months shown (`?range=`), 12 by default. */
export function useRangeParam(): [IncomeRange, (r: IncomeRange) => void] {
  const param = useUrlParam("range");
  const range = (RANGES as readonly string[]).includes(param ?? "") ? (param as IncomeRange) : "12m";
  const set = React.useCallback((r: IncomeRange) => {
    replaceUrlParams({ range: r === "12m" ? null : r });
  }, []);
  return [range, set];
}

/** The currency in view (`?currency=`) when a scope has several. */
export function useCurrencyParam(): [string | null, (c: string | null) => void] {
  const param = useUrlParam("currency");
  const set = React.useCallback((c: string | null) => {
    replaceUrlParams({ currency: c });
  }, []);
  return [param, set];
}
