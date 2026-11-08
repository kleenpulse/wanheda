"use client";

import * as React from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// A Media Home shelf (T73): a title, a "See all" pill, and a row of cards that
// scrolls sideways with snap points, a fade at whichever edge has more, and
// prev|next arrows on hover. The cards are one tab stop: the arrow keys move
// between them (roving focus), Home and End jump to the ends.

/** Marks a card's main button: the one the shelf's arrow keys move between. */
export const SHELF_CARD = "data-shelf-card";

const reducedMotion = () =>
  document.documentElement.dataset.motion === "reduce" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Shelf({
  title,
  onSeeAll,
  seeAllLabel = "See all",
  tools,
  children,
}: {
  title: string;
  onSeeAll?: (() => void) | undefined;
  seeAllLabel?: string;
  /** Beside the title: Most played's genre chips. */
  tools?: React.ReactNode;
  children: React.ReactNode;
}) {
  const id = React.useId();
  const row = React.useRef<HTMLUListElement>(null);
  const [ends, setEnds] = React.useState({ start: true, end: true });
  const active = React.useRef(0);

  const cards = React.useCallback(() => Array.from(row.current?.querySelectorAll<HTMLElement>(`[${SHELF_CARD}]`) ?? []), []);

  // One tab stop: the active card takes Tab, the rest wait for the arrow keys. After every
  // render, not on a count: a list swapped for one as long brings new buttons at tabIndex 0.
  const count = React.Children.count(children);
  React.useLayoutEffect(() => {
    const all = cards();
    if (active.current >= all.length) active.current = Math.max(0, all.length - 1);
    all.forEach((el, i) => {
      el.tabIndex = i === active.current ? 0 : -1;
    });
  });

  const measure = React.useCallback(() => {
    const el = row.current;
    if (!el) return;
    const start = el.scrollLeft <= 1;
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    setEnds((e) => (e.start === start && e.end === end ? e : { start, end }));
  }, []);
  React.useEffect(() => {
    const el = row.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [measure, count]);

  const page = (dir: 1 | -1) => {
    const el = row.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: reducedMotion() ? "auto" : "smooth" });
  };

  const focusCard = (i: number) => {
    const all = cards();
    const to = all[Math.max(0, Math.min(all.length - 1, i))];
    if (!to) return;
    all.forEach((el) => {
      el.tabIndex = el === to ? 0 : -1;
    });
    active.current = all.indexOf(to);
    to.focus({ preventScroll: true });
    to.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
  };

  return (
    <section aria-labelledby={id} className="group/shelf flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id={id} className="font-display text-lg leading-tight tracking-[-0.01em] text-foreground">
          {title}
        </h2>
        {tools}
        <span className="ml-auto flex items-center gap-1.5">
          {/* Arrows for a mouse: they show on hover or keyboard focus, and stay out of touch's way. */}
          <span className="hidden items-center gap-1.5 opacity-0 transition-opacity duration-150 group-focus-within/shelf:opacity-100 group-hover/shelf:opacity-100 pointer-fine:flex">
            <button type="button" aria-label={`Scroll ${title} back`} disabled={ends.start} onClick={() => { page(-1); }} className={buttonClass("ghost", "circle-sm", "bg-foreground/6 dark:bg-card-nested")}>
              <ChevronLeft aria-hidden />
            </button>
            <button type="button" aria-label={`Scroll ${title} on`} disabled={ends.end} onClick={() => { page(1); }} className={buttonClass("ghost", "circle-sm", "bg-foreground/6 dark:bg-card-nested")}>
              <ChevronRight aria-hidden />
            </button>
          </span>
          {onSeeAll ? (
            <button type="button" onClick={onSeeAll} className={buttonClass("ghost", "pill-sm", "bg-foreground/6 text-foreground dark:bg-card-nested")} aria-label={`${seeAllLabel}: ${title}`}>
              {seeAllLabel}
              <ArrowRight aria-hidden />
            </button>
          ) : null}
        </span>
      </div>
      <ul
        ref={row}
        aria-labelledby={id}
        onScroll={measure}
        onFocus={(e) => {
          const i = cards().indexOf(e.target);
          if (i >= 0) active.current = i;
        }}
        onKeyDown={(e) => {
          if (!(e.target instanceof HTMLElement) || !e.target.hasAttribute(SHELF_CARD)) return;
          const i = cards().indexOf(e.target);
          const to = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? Infinity : null;
          if (to === null) return;
          e.preventDefault();
          focusCard(to === Infinity ? cards().length - 1 : to);
        }}
        // Room for focus rings and the hover lift, which overflow-x would otherwise clip.
        className="-mx-2 flex snap-x snap-mandatory scroll-px-2 gap-4 overflow-x-auto overscroll-x-contain px-2 pt-1.5 pb-3 scroll-fade-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </ul>
    </section>
  );
}

/** One card's place on a shelf. */
export function ShelfItem({ className, children }: { className?: string; children: React.ReactNode }) {
  return <li className={cn("shrink-0 snap-start", className)}>{children}</li>;
}
