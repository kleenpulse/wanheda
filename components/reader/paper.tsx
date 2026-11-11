"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Check } from "lucide-react";
import * as React from "react";
import { Menu, MenuContent, MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/utils";
import { PAPER_TONES, type Paper, type PaperTone } from "@/lib/reader/prefs";
import { paperPref } from "./prefs";
import { Tip } from "@/components/ui/tooltip";

// The page's paper (user 2026-11-06): the Notes sticky palette, gentler on the
// eyes than white. Light papers lay a multiply wash over the drawn page, so its
// white turns the paper's colour and the ink stays dark; dark papers invert the
// page first, then a screen wash lifts its black to the paper (globals.css,
// .paper-wash). Pure CSS, so a change is instant and no page is drawn again.
// Markdown and text sit on the paper itself, in its own ink (.md-sheet).
// This device's choice for every document.

type Tone = PaperTone;
export type { Paper };

const LABEL: Record<Tone, string> = { plain: "Plain", amber: "Amber", rose: "Rose", sky: "Sky", mint: "Mint", violet: "Violet" };

// Static strings, so Tailwind and the CSS see every one. Values live in globals.css.
const COLOR: Record<Paper, string> = {
  // Not --paper: the stage overrides that with the chosen paper.
  plain: "var(--paper-plain)",
  amber: "var(--paper-amber)",
  rose: "var(--paper-rose)",
  sky: "var(--paper-sky)",
  mint: "var(--paper-mint)",
  violet: "var(--paper-violet)",
  "night-plain": "var(--paper-night)",
  "night-amber": "var(--paper-night-amber)",
  "night-rose": "var(--paper-night-rose)",
  "night-sky": "var(--paper-night-sky)",
  "night-mint": "var(--paper-night-mint)",
  "night-violet": "var(--paper-night-violet)",
};

export { paperPref };

const isNight = (p: Paper) => p.startsWith("night-");

function labelOf(p: Paper): string {
  return isNight(p) ? `${LABEL[p.slice(6) as Tone]}, dark` : LABEL[p as Tone];
}

/** The stage's class and style for a paper: every page, edge and thumbnail inside takes it. */
export function paperProps(p: Paper): { className: string | undefined; style: React.CSSProperties | undefined } {
  if (p === "plain") return { className: undefined, style: undefined };
  return {
    className: isNight(p) ? "paper-night" : "paper-tinted",
    style: { "--paper": COLOR[p] } as React.CSSProperties,
  };
}

/**
 * Picks the paper. A swatch per tone, light and dark. Hovering or arrowing onto
 * one previews it on the page (user 2026-11-06); leaving or closing the menu
 * puts the chosen paper back. The menu stays open after a pick.
 */
export function PaperMenu({
  paper,
  onPaper,
  onPreview,
  container,
  className,
}: {
  paper: Paper;
  onPaper: (p: Paper) => void;
  /** The paper shown while a swatch is under the pointer or keyboard, or null for the chosen one. */
  onPreview: (p: Paper | null) => void;
  /** Where the menu renders: the stage, so it still shows in full screen. */
  container: HTMLElement | null;
  className: string;
}) {
  // A menu opened from the keyboard focuses its first swatch; that alone must not
  // repaint the page. Focus previews only after a key or the pointer moved in it.
  const moved = React.useRef(false);
  return (
    <Menu
      onOpenChange={(open) => {
        moved.current = false;
        if (!open) onPreview(null);
      }}
    >
      <MenuTrigger className={className} aria-label={`Paper colour, now ${labelOf(paper)}`} title="Paper colour">
        {/* On the dark stage: edged in the stage's ink, so a dark paper still shows. */}
        <Swatch paper={paper} className="size-[18px] shadow-stage-ink/40" />
      </MenuTrigger>
      <MenuContent
        side="bottom"
        align="end"
        container={container}
        className="min-w-0 p-2"
        onPointerLeave={() => {
          onPreview(null);
        }}
        onKeyDown={() => {
          moved.current = true;
        }}
      >
        {(["light", "dark"] as const).map((group) => (
          <MenuPrimitive.RadioGroup
            key={group}
            value={paper}
            onValueChange={(v: Paper) => {
              onPaper(v);
            }}
            className="not-first:mt-1.5"
          >
            <MenuPrimitive.GroupLabel className="px-1 pb-1 font-mono text-[10.5px] tracking-wide text-ink-3 uppercase">
              {group === "light" ? "Light" : "Dark"}
            </MenuPrimitive.GroupLabel>
            <div className="flex gap-1">
              {PAPER_TONES.map((t) => {
                const p: Paper = group === "light" ? t : `night-${t}`;
                return (
                  <MenuPrimitive.RadioItem
                    key={p}
                    value={p}
                    aria-label={labelOf(p)}
                    title={labelOf(p)}
                    onPointerEnter={() => {
                      onPreview(p);
                    }}
                    onFocus={() => {
                      if (moved.current) onPreview(p);
                    }}
                    className="relative flex size-9 items-center justify-center rounded-[12px] outline-none transition-colors duration-100 data-[highlighted]:bg-muted dark:data-[highlighted]:bg-accent"
                  >
                    <Swatch paper={p} className="size-7 shadow-foreground/15" />
                    {p === paper ? (
                      <Check aria-hidden strokeWidth={2.5} className={cn("absolute size-3.5", isNight(p) ? "text-stage-ink" : "text-stage")} />
                    ) : null}
                  </MenuPrimitive.RadioItem>
                );
              })}
            </div>
          </MenuPrimitive.RadioGroup>
        ))}
      </MenuContent>
    </Menu>
  );
}

function Swatch({ paper, className }: { paper: Paper; className?: string }) {
  return <span aria-hidden className={cn("block shrink-0 rounded-full shadow-[inset_0_0_0_1px]", className)} style={{ background: COLOR[paper] }} />;
}

/** The papers as a row of swatches each for light and dark (Settings → Reader): a radio group. */
export function PaperPicker({ paper, onPaper, labelledBy }: { paper: Paper; onPaper: (p: Paper) => void; labelledBy: string }) {
  const all: Paper[] = [...PAPER_TONES, ...PAPER_TONES.map((t): Paper => `night-${t}`)];
  // Ids unique to this picker, so two on screen at once never focus each other's swatches.
  const base = React.useId();
  const idOf = (p: Paper) => `${base}-${p}`;
  const pick = (p: Paper | undefined) => {
    if (!p) return;
    onPaper(p);
    document.getElementById(idOf(p))?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className="flex flex-col gap-1.5"
      onKeyDown={(e) => {
        const i = all.indexOf(paper);
        const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        pick(all[(i + step + all.length) % all.length]);
      }}
    >
      {(["light", "dark"] as const).map((group) => (
        <div key={group} className="flex items-center gap-1">
          {PAPER_TONES.map((t) => {
            const p: Paper = group === "light" ? t : `night-${t}`;
            const on = p === paper;
            return (
              <Tip
                key={p}
                id={idOf(p)}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={labelOf(p)}
                label={labelOf(p)}
                tabIndex={on ? 0 : -1}
                onClick={() => {
                  onPaper(p);
                }}
                className="relative flex size-9 items-center justify-center rounded-[12px] outline-none transition-colors duration-100 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-accent"
              >
                <Swatch paper={p} className="size-7 shadow-foreground/15" />
                {on ? <Check aria-hidden strokeWidth={2.5} className={cn("absolute size-3.5", isNight(p) ? "text-stage-ink" : "text-stage")} /> : null}
              </Tip>
            );
          })}
        </div>
      ))}
    </div>
  );
}
