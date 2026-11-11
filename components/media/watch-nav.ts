"use client";

import { pushUrl } from "@/hooks/use-url-param";
import { mediaHref } from "@/lib/media/media";

// Opening an item from inside /media (T73): the Watch view takes over, and the
// tab it was opened from stays in the URL, and the folder open in Videos with
// it, so Back returns there.

/** The Videos tab's open folder (`folderGroups`' key), in the URL. */
export const FOLDER_PARAM = "folder";

/** The item's /media URL from the tab (and the folder) on screen now. */
export function watchHref(id: string): ReturnType<typeof mediaHref> {
  const here = new URLSearchParams(window.location.search);
  const href = mediaHref(id, here.get("tab"));
  const folder = here.get(FOLDER_PARAM);
  return folder ? `${href}&${FOLDER_PARAM}=${encodeURIComponent(folder)}` : href;
}

/** Opens a folder in the Videos tab, with a history entry (Back returns to the folders). */
export function openFolder(key: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set(FOLDER_PARAM, key);
  pushUrl(`${url.pathname}${url.search}`);
}

/** Opens the item in the Watch view, with a history entry (Back returns to the tab). */
export function openWatch(id: string): void {
  pushUrl(watchHref(id));
}
