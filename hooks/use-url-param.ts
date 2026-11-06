"use client";

import * as React from "react";

// A view's state in the query string (`?p=`, `?product=`), so a reload or a
// shared link opens the same view. Read straight from the location rather
// than through useSearchParams, which would put a Suspense boundary in front
// of the page's first paint (SPEC V24); the server render sees no param.
// Written with replaceState: changing a view is not a page to go back through.

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

export function useUrlParam(name: string): string | null {
  const read = React.useCallback(() => new URLSearchParams(window.location.search).get(name), [name]);
  return React.useSyncExternalStore(subscribe, read, serverParam);
}

/** Sets or (null) clears params in place, and tells every reader. */
export function replaceUrlParams(patch: Readonly<Record<string, string | null>>) {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  // Next.js syncs its router with native history calls.
  window.history.replaceState(null, "", url);
  for (const l of listeners) l();
}

/** Moves to a URL on the same page with a history entry (Back returns), and tells every reader. */
export function pushUrl(href: string) {
  window.history.pushState(null, "", href);
  for (const l of listeners) l();
}
