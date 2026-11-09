"use client";

import * as React from "react";
import { ACTIVITY_STORAGE_KEY, useActivity } from "@/lib/activity/store";

/**
 * Loads the activity bus from localStorage after mount (the server renders no
 * activities) and follows other tabs through the `storage` event.
 */
export function useActivitySync() {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    void Promise.resolve(useActivity.persist.rehydrate()).then(() => {
      setReady(true);
    });
    const onStorage = (e: StorageEvent) => {
      if (e.key === ACTIVITY_STORAGE_KEY) void useActivity.persist.rehydrate();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return ready;
}
