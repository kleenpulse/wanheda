"use client";

import * as React from "react";

/**
 * The current time, ticking on whole multiples of `stepMs` (a minute clock
 * flips on the minute). Null on the server and the first client render, so
 * nothing time-based is baked into the HTML. Stops while the tab is hidden
 * and catches up when it returns (SPEC V17).
 */
export function useNow(stepMs: number): number | null {
  const [now, setNow] = React.useState<number | null>(null);

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      timer = setTimeout(tick, stepMs - (t % stepMs) + 20);
    };
    const onVisibility = () => {
      clearTimeout(timer);
      if (document.visibilityState === "visible") tick();
    };
    tick();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [stepMs]);

  return now;
}
