"use client";

import type * as React from "react";
import { Tip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Pieces the income pages share: a figure tile, a quiet notice, and the dash a
// metric with no denominator shows (V36).

export function Dash() {
  return (
    <Tip label="No denominator yet" render={<span className="text-ink-3" />}>
      <span aria-hidden>—</span>
      <span className="sr-only">No denominator yet</span>
    </Tip>
  );
}

/** `compact`: long figures (cash in kobo-precision naira) keep the smaller size on wide screens too. */
export function Tile({ label, note, compact = false, children }: { label: string; note: React.ReactNode; compact?: boolean; children: React.ReactNode }) {
  return (
    <div className="bento flex min-w-0 flex-col gap-2 p-4 @3xl/main:p-5">
      <h3 className="readout truncate">{label}</h3>
      <div className={cn("truncate font-display text-[22px] leading-none font-semibold tracking-[-0.01em] text-foreground", !compact && "@3xl/main:text-[28px]")}>{children}</div>
      <div className="min-w-0 truncate text-[12px] text-ink-2">{note}</div>
    </div>
  );
}

export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="rounded-[14px] bg-card-nested px-3 py-2 text-[13px] text-ink-2">
      {children}
    </p>
  );
}
