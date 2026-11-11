"use client";

import * as React from "react";
import { ISLAND_SHOWN_KEY, encodeIslandShown, parseIslandShown } from "@/lib/island/shown";

// The island's on/off setting, client side (lib/island/shown.ts): read from
// localStorage once, mirrored into React through useSyncExternalStore. Other
// tabs, and the desktop app's island window, follow through the storage event.

const listeners = new Set<() => void>();
let cached: boolean | null = null;

function read(): boolean {
  if (cached === null) {
    try {
      cached = parseIslandShown(localStorage.getItem(ISLAND_SHOWN_KEY));
    } catch {
      // No storage (private mode): the island shows.
      cached = true;
    }
  }
  return cached;
}

function notify() {
  for (const l of listeners) l();
}

function onStorage(e: StorageEvent) {
  // A null key is the whole store cleared: back to the default.
  if (e.key !== null && e.key !== ISLAND_SHOWN_KEY) return;
  cached = e.key === null ? true : parseIslandShown(e.newValue);
  notify();
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    // Nothing was listening: another window may have changed it meanwhile, so read it again.
    cached = null;
    window.addEventListener("storage", onStorage);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

export function setIslandShown(shown: boolean) {
  cached = shown;
  try {
    localStorage.setItem(ISLAND_SHOWN_KEY, encodeIslandShown(shown));
  } catch {
    // Private mode: it still applies to this tab.
  }
  notify();
}

/** Whether this device shows the island. The server render (and the hydration pass) says yes. */
export function useIslandShown(): boolean {
  return React.useSyncExternalStore(subscribe, read, () => true);
}
