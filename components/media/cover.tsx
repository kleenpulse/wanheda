"use client";

import * as React from "react";
import { Disc3 } from "lucide-react";
import { COVERS_DIR } from "@/lib/media/music-protocol";
import { onOpfsImage, opfsImageUrl } from "@/lib/media/opfs-image";
import { cn } from "@/lib/utils";

// An album cover from OPFS (V58: one WebP per distinct picture, keyed by its
// sha256). Found URLs are cached for the tab, so a scrolled list reads each
// cover once; a miss is asked again later (opfs-image.ts), so a cover the
// scan writes after a first look still shows.

/** A picture's object URL from OPFS once read (null without one, or before it loads); re-read when it's written. */
export function useOpfsImage(dir: string, key: string | null): string | null {
  const [state, setState] = React.useState<{ key: string; url: string | null } | null>(null);
  React.useEffect(() => {
    if (!key) return;
    let alive = true;
    const read = () => {
      void opfsImageUrl(dir, key).then((url) => {
        if (alive) setState({ key, url });
      });
    };
    read();
    const off = onOpfsImage(dir, key, read);
    return () => {
      alive = false;
      off();
    };
  }, [dir, key]);
  return key && state?.key === key ? state.url : null;
}

/** A cover's object URL once read (null without a cover, or before it loads). */
export function useCoverUrl(coverKey: string | null): string | null {
  return useOpfsImage(COVERS_DIR, coverKey);
}

export function Cover({ coverKey, className }: { coverKey: string | null; className?: string }) {
  const url = useCoverUrl(coverKey);
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden bg-foreground/6 text-ink-3 dark:bg-card-nested", className)}>
      {url && coverKey ? <img src={url} alt="" className="size-full object-cover" /> : <Disc3 aria-hidden className="size-1/2" />}
    </span>
  );
}
