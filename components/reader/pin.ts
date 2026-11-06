"use client";

import { createDevicePref } from "@/hooks/device-pref";

// The library's pinned document (user 2026-11-06): one at a time, first in the
// grid, its cover a liquid tank filled to how far it's read. This device's
// choice, like Home's pinned billing cycle (renewal-cycle.tsx), so it lives in
// localStorage, not on the document. A pin whose document is gone is ignored.

const pin = createDevicePref<string | null>(
  "wanheda-reader-pin",
  (raw) => raw,
  (id) => id,
);

/** Pins a document, replacing any other pin; null unpins. */
export const setPinned = pin.set;

/** The pinned document's id on this device, or null. */
export const usePinned = pin.use;
