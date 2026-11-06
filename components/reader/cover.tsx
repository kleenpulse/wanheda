"use client";

import type * as React from "react";
import { useAccount } from "@/components/shell/account";
import { FileText, FileType2, Hash, type LucideIcon } from "lucide-react";
import type { DocKind, ReaderDoc } from "@/lib/reader/reader";
import { cn } from "@/lib/utils";
import { useCover } from "./covers";

// A document's cover, drawn from its metadata: a duo-tone tint picked by the
// file's hash (stable on every device), the title set in the display face and
// the kind as a readout. A PDF shows its real page one instead once this
// device has made it (covers.ts, T47); this is what it falls back to.

const TONES = [
  "bg-cat-blue/14 text-cat-blue",
  "bg-cat-violet/14 text-cat-violet",
  "bg-cat-aqua/16 text-cat-aqua",
  "bg-cat-green/14 text-cat-green",
  "bg-cat-magenta/12 text-cat-magenta",
  "bg-cat-yellow/18 text-cat-yellow",
  "bg-cat-cyan/14 text-cat-cyan",
  "bg-cat-slate/16 text-cat-slate",
] as const;

const BANDS = ["bg-cat-blue/22", "bg-cat-violet/22", "bg-cat-aqua/26", "bg-cat-green/22", "bg-cat-magenta/20", "bg-cat-yellow/28", "bg-cat-cyan/22", "bg-cat-slate/26"] as const;

const KIND: Record<DocKind, { label: string; icon: LucideIcon }> = {
  pdf: { label: "PDF", icon: FileType2 },
  md: { label: "Markdown", icon: Hash },
  txt: { label: "Text", icon: FileText },
  epub: { label: "EPUB", icon: FileText },
};

function tone(sha256: string): number {
  return Number.parseInt(sha256.slice(0, 2), 16) % TONES.length || 0;
}

export function kindLabel(kind: DocKind): string {
  return KIND[kind].label;
}

/** "312 pages", "1 page", or null when the count isn't known yet (T49: read by pdf.js on add or open). */
export function pagesLabel(pages: number | null): string | null {
  if (pages === null) return null;
  return `${pages.toLocaleString("en-GB")} ${pages === 1 ? "page" : "pages"}`;
}

export function Cover({
  doc,
  size = "md",
  badge,
  className,
}: {
  doc: Pick<ReaderDoc, "title" | "author" | "kind" | "sha256">;
  size?: "sm" | "md";
  /** A status shown at the top right, beside the kind. */
  badge?: React.ReactNode;
  className?: string;
}) {
  const demo = useAccount().kind !== "owner";
  const image = useCover(doc, demo);
  const t = tone(doc.sha256);
  const { icon: Icon, label } = KIND[doc.kind];
  if (image) {
    return (
      <div
        aria-hidden
        className={cn("relative aspect-[3/4] w-full overflow-hidden bg-paper", size === "sm" ? "rounded-[8px]" : "rounded-[14px]", className)}
      >
        {/* A blob URL from this device: next/image can't optimise it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" draggable={false} className="size-full object-cover object-top" />
        {size === "md" && badge ? <span className="absolute top-3 right-3 flex min-w-0 justify-end">{badge}</span> : null}
      </div>
    );
  }
  return (
    <div
      aria-hidden
      className={cn(
        "relative flex aspect-[3/4] w-full flex-col justify-between overflow-hidden",
        size === "sm" ? "rounded-[8px] p-1.5" : "rounded-[14px] p-3.5",
        TONES[t],
        className,
      )}
    >
      <span className={cn("absolute inset-y-0 left-0", size === "sm" ? "w-1" : "w-2.5", BANDS[t])} />
      {size === "md" ? (
        <>
          <span className="flex min-w-0 items-center justify-between gap-2 pl-1.5">
            <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
              <Icon className="size-3" />
              {label}
            </span>
            {badge}
          </span>
          <span className="flex flex-col gap-1.5 pl-1.5">
            <span className="line-clamp-4 font-display text-[15px] leading-[1.15] font-semibold tracking-[-0.01em] text-balance text-foreground">
              {doc.title}
            </span>
            {doc.author ? <span className="truncate text-[11.5px] text-ink-2">{doc.author}</span> : null}
          </span>
        </>
      ) : (
        <Icon className="m-auto size-4" />
      )}
    </div>
  );
}
