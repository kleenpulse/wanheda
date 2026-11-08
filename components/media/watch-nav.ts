"use client";

import { pushUrl } from "@/hooks/use-url-param";
import { mediaHref } from "@/lib/media/media";

// Opening an item from inside /media (T73): the Watch view takes over, and the
// tab it was opened from stays in the URL, so Back returns there.

/** The item's /media URL from the tab on screen now. */
export function watchHref(id: string): ReturnType<typeof mediaHref> {
  return mediaHref(id, new URLSearchParams(window.location.search).get("tab"));
}

/** Opens the item in the Watch view, with a history entry (Back returns to the tab). */
export function openWatch(id: string): void {
  pushUrl(watchHref(id));
}
