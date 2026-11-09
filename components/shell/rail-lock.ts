"use client";

import * as React from "react";
import { create } from "zustand";

/*
  Holds the nav rail collapsed for views that need the width (from
  ellum-harness). The saved preference (the cookie) is never touched: when the
  hold lifts, the rail goes back to what the owner chose. While held, a toggle
  shows why instead of opening.
*/

export const useRailLock = create<{ reason: string | null }>(() => ({ reason: null }));

/**
 * Holds the rail shut while `reason` is non-null; null (or unmount) lets go.
 * `reason` tells the owner how to get the rail back.
 */
export function useHoldRail(reason: string | null) {
  React.useEffect(() => {
    if (!reason) return;
    useRailLock.setState({ reason });
    return () => {
      if (useRailLock.getState().reason === reason) useRailLock.setState({ reason: null });
    };
  }, [reason]);
}
