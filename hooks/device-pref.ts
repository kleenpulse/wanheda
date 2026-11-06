"use client";

import * as React from "react";

// A preference kept on this device only (localStorage), shared by every tab:
// Home's pinned billing cycle, the reader's pin, spread or one page, auto-scroll
// speed and paper. Where localStorage refuses writes (some private windows) the
// value lives in this page until it reloads.

export interface DevicePref<T> {
  use: () => T;
  set: (value: T) => void;
}

export function createDevicePref<T>(key: string, parse: (raw: string | null) => T, serialize: (value: T) => string | null): DevicePref<T> {
  const listeners = new Set<() => void>();
  let fallback: { value: T } | null = null;
  // Cached by the stored string, so useSyncExternalStore sees a stable value between changes.
  let cache: { raw: string | null; value: T } | null = null;

  const read = (): T => {
    if (fallback) return fallback.value;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      raw = null;
    }
    if (!cache || cache.raw !== raw) cache = { raw, value: parse(raw) };
    return cache.value;
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  };
  const initial = parse(null);
  return {
    use: () => React.useSyncExternalStore(subscribe, read, () => initial),
    set: (value) => {
      const raw = serialize(value);
      try {
        if (raw === null) localStorage.removeItem(key);
        else localStorage.setItem(key, raw);
        // Stored after all: reads go back to localStorage.
        fallback = null;
      } catch {
        fallback = { value };
      }
      for (const l of listeners) l();
    },
  };
}
