"use client";

import * as React from "react";
import { syncServiceWorker } from "@/lib/sw/client";

/** Registers the offline worker once the page has loaded (T91). Renders nothing. */
export function ServiceWorker() {
  React.useEffect(() => {
    if (document.readyState === "complete") {
      void syncServiceWorker();
      return;
    }
    const onLoad = () => void syncServiceWorker();
    window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);
  return null;
}
