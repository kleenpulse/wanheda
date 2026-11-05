"use client";

import { Check, Palette } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { NOTE_COLORS, type NoteColor } from "@/lib/notes/notes";
import { cn } from "@/lib/utils";

// The sticky data palette (SPEC T31, V15): role tokens from globals.css,
// never the signal. Fills carry ink and ink-2 only; marks carry identity and
// always travel with the colour's name, so colour is never the only cue.
// Static class strings, so Tailwind sees every one.

export const STICKY_FILL: Record<NoteColor, string> = {
  plain: "bg-sticky-plain",
  amber: "bg-sticky-amber",
  rose: "bg-sticky-rose",
  sky: "bg-sticky-sky",
  mint: "bg-sticky-mint",
  violet: "bg-sticky-violet",
};

export const STICKY_MARK: Record<NoteColor, string> = {
  plain: "bg-sticky-plain-mark",
  amber: "bg-sticky-amber-mark",
  rose: "bg-sticky-rose-mark",
  sky: "bg-sticky-sky-mark",
  mint: "bg-sticky-mint-mark",
  violet: "bg-sticky-violet-mark",
};

export const COLOR_LABEL: Record<NoteColor, string> = {
  plain: "Plain",
  amber: "Amber",
  rose: "Rose",
  sky: "Sky",
  mint: "Mint",
  violet: "Violet",
};

/** A sticky's colour swatch: its fill, edged by its mark. */
export function Swatch({ color, className }: { color: NoteColor; className?: string }) {
  return (
    <span aria-hidden className={cn("relative inline-block size-4 shrink-0 overflow-hidden rounded-full ring-1 ring-border", STICKY_FILL[color], className)}>
      <span className={cn("absolute inset-x-0 top-0 h-1/2", STICKY_MARK[color], color === "plain" && "opacity-30")} />
    </span>
  );
}

/** Picks a note's colour. Each choice shows its name. */
export function NoteColorMenu({
  color,
  onPick,
  className,
}: {
  color: NoteColor;
  onPick: (color: NoteColor) => void;
  className?: string;
}) {
  return (
    <Menu>
      <MenuTrigger data-no-drag className={buttonClass("ghost", "circle-sm", cn("size-8", className))} title={`Colour: ${COLOR_LABEL[color]}`}>
        <Palette aria-hidden strokeWidth={1.75} />
        <span className="sr-only">Colour, now {COLOR_LABEL[color]}</span>
      </MenuTrigger>
      <MenuContent align="end" className="min-w-44">
        {NOTE_COLORS.map((c) => (
          <MenuItem
            key={c}
            onClick={() => {
              onPick(c);
            }}
          >
            <Swatch color={c} />
            <span className="flex-1 text-foreground">{COLOR_LABEL[c]}</span>
            {c === color ? <Check aria-label="Current" /> : null}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

/** "2/5 done" with a thin bar in the note's mark (FR-NOTES-5). */
export function StickyProgress({ done, total, color }: { done: number; total: number; color: NoteColor }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <span className="readout flex items-center gap-2 tabular">
      <span className="shrink-0">
        {done}/{total} done
      </span>
      <span aria-hidden className="h-1 min-w-6 flex-1 overflow-hidden rounded-pill bg-foreground/10">
        <span className={cn("block h-full rounded-pill", STICKY_MARK[color])} style={{ width: `${String(pct)}%` }} />
      </span>
    </span>
  );
}
