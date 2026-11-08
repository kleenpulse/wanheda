"use client";

import * as React from "react";
import { Clapperboard, HardDrive, Link2, Music } from "lucide-react";
import { THUMBS_DIR, thumbKey } from "@/lib/media/opfs-image";
import type { MediaItem } from "@/lib/media/types";
import { cn } from "@/lib/utils";
import { useOpfsImage } from "./cover";
import { canThumb, wantThumb } from "./thumb-queue";

// A video's picture for cards, rows and the up-next rail (T72): its thumbnail
// from this device (thumb-queue.ts makes it), else a duo-tone tile, the
// signal's own tint with the kind's glyph on an opaque base (it sits over the
// picture in the rail), never a raw colour (C5).

const keys = new Map<string, string>();

/** The item's thumbnail URL, or null; asks the queue for one when there is none. */
export function useThumbUrl(item: MediaItem): string | null {
  const able = canThumb(item);
  // The key is a hash (async), remembered per fp for the tab, so a list reads each once.
  const [hashed, setHashed] = React.useState<{ fp: string; key: string } | null>(null);
  const known = keys.get(item.fp);
  React.useEffect(() => {
    if (!able || keys.has(item.fp)) return;
    let alive = true;
    void thumbKey(item.fp).then((k) => {
      keys.set(item.fp, k);
      if (alive) setHashed({ fp: item.fp, key: k });
    });
    return () => {
      alive = false;
    };
  }, [able, item.fp]);
  const key = able ? (known ?? (hashed?.fp === item.fp ? hashed.key : null)) : null;
  const url = useOpfsImage(THUMBS_DIR, key);
  // Asked once per key and per answer, never per render: a re-laid list makes new item objects.
  const want = React.useEffectEvent(() => {
    wantThumb(item);
  });
  React.useEffect(() => {
    if (key && url === null) want();
  }, [key, url]);
  return url;
}

function Glyph({ item }: { item: MediaItem }) {
  const Icon = item.kind === "audio" ? Music : item.source === "embed" ? Link2 : item.source === "local" ? HardDrive : Clapperboard;
  return <Icon aria-hidden className="size-[22%] max-w-8 min-w-4" />;
}

export function Thumb({ item, className, children }: { item: MediaItem; className?: string; children?: React.ReactNode }) {
  const url = useThumbUrl(item);
  return (
    <span className={cn("relative isolate flex aspect-video items-center justify-center overflow-hidden bg-sheet dark:bg-card", className)}>
      {url ? (
        <img src={url} alt="" draggable={false} className="absolute inset-0 -z-10 size-full object-cover" />
      ) : (
        <span aria-hidden className="absolute inset-0 -z-10 flex items-center justify-center bg-signal-soft text-signal-ink dark:bg-signal/15 dark:text-signal">
          <Glyph item={item} />
        </span>
      )}
      {children}
    </span>
  );
}
