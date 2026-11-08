"use client";

import * as React from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { desktopBridge, isAppPath } from "@/lib/platform/desktop";

/** In the desktop app, goes where an opened `wanheda://` link points, without reloading the page. */
export function DesktopOpen() {
  const router = useRouter();
  React.useEffect(() => {
    return desktopBridge()?.onOpen((path) => {
      if (isAppPath(path)) router.push(path as Route);
    });
  }, [router]);
  return null;
}
