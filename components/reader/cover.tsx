import type * as React from "react";
import { FileText, FileType2, Hash, type LucideIcon } from "lucide-react";
import type { DocKind, ReaderDoc } from "@/lib/reader/reader";
import { cn } from "@/lib/utils";

// A document's cover, drawn from its metadata: a duo-tone tint picked by the
// file's hash (stable on every device), the title set in the display face and
// the kind as a readout. Real page-one covers for PDFs arrive with the PDF
// viewer (T47), which brings pdf.js; this is what they fall back to.

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
  const t = tone(doc.sha256);
  const { icon: Icon, label } = KIND[doc.kind];
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
