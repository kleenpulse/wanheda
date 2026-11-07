"use client";

import * as React from "react";
import { Disc3 } from "lucide-react";
import { COVERS_DIR } from "@/lib/media/music-protocol";
import { cn } from "@/lib/utils";

// An album cover from OPFS (V58: one WebP per distinct picture, keyed by its
// sha256). Object URLs are cached for the tab, so a scrolled list reads each
// cover once.

const urls = new Map<string, Promise<string | null>>();

function coverUrl(key: string): Promise<string | null> {
  let p = urls.get(key);
  if (!p) {
    p = (async () => {
      try {
        const root = await navigator.storage.getDirectory();
        const dir = await root.getDirectoryHandle(COVERS_DIR);
        const file = await (await dir.getFileHandle(`${key}.webp`)).getFile();
        return URL.createObjectURL(file);
      } catch {
        return null;
      }
    })();
    urls.set(key, p);
  }
  return p;
}

export function Cover({ coverKey, className }: { coverKey: string | null; className?: string }) {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!coverKey) return;
    let alive = true;
    void coverUrl(coverKey).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [coverKey]);
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden bg-foreground/6 text-ink-3 dark:bg-card-nested", className)}>
      {url && coverKey ? <img src={url} alt="" className="size-full object-cover" /> : <Disc3 aria-hidden className="size-1/2" />}
    </span>
  );
}
