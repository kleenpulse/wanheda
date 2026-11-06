"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageFlip, type PageRect } from "page-flip";
import {
  PHANTOM,
  bookWindow,
  needsRebuild,
  spreadAtIndex,
  spreadCount,
  spreadOf,
  spreadPages,
  windowIndex,
  type BookLayout,
  type BookWindow,
} from "@/lib/reader/book";
import { useElementWidth } from "@/hooks/use-element-width";
import { cn } from "@/lib/utils";

// The book (SPEC V42): pages in a page-flip spread, curled by hand-wrapped
// page-flip 2.0.7 (never react-pageflip). Shared by the PDF book (page images,
// pdf/book-view.tsx) and the Markdown / text book (pages of text,
// md/md-book.tsx): each says how a page element is made and fills the open
// ones; this file owns page-flip.
//
// Two things about page-flip shape this file:
// - Its renderer restyles EVERY page it holds on every animation frame. So it
//   only ever holds a window of a few spreads (lib/reader/book.ts), rebuilt
//   around the open spread when a turn lands at the window's edge.
// - Its rAF loop never stops, not even after destroy(). So there is one
//   instance per mount, and on unmount it is neutered: its draw step becomes
//   a no-op and every page, element and listener it holds is let go, so the
//   orphaned loop does no work and keeps neither the document nor an image.

export interface BookHandle {
  next(): void;
  prev(): void;
  /** Turns to a page: a curl to the spread beside, at once to one further off. */
  goTo(page: number): void;
  /** Shows a page at once, never a curl (the pages were laid out again). */
  jump(page: number): void;
  /** The element that scrolls down the page (fitted to the width, or zoomed), or null when the whole page shows. */
  scroller(): HTMLElement | null;
  /** On the last spread: nothing left to turn to. */
  atEnd(): boolean;
  /** A turn is in flight. */
  turning(): boolean;
}

/** What's open, for filling pages: the spread, the page elements held, and the page's width in px. */
export interface OpenBook {
  spread: number;
  /** Page number → its element, for every page in page-flip's window. Read it in an effect. */
  elements: ReadonlyMap<number, HTMLElement>;
  pageWidth: number;
  /** Bumps when the window is rebuilt: pages that just joined it want filling. */
  held: number;
}

const FLIP_MS = 700;
/** Below this many pixels of drag a pointer-up is a tap, not a swipe (reduced motion only). */
const SWIPE_PX = 40;
/** Widest a page fitted to the width gets (single page on a wide screen), before zoom. */
const FIT_MAX = 900;
/** Room the book's frame keeps around the page: the edge arrows either side (sm:px-16). */
const FRAME_X = 128;
/** Air between the page and the bars floating over the stage, above and below. */
const FRAME_Y = 14;

/** Where the visible book sits in the host, for the edge stacks. */
interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

function phantom(): HTMLElement {
  const el = document.createElement("div");
  el.className = "book-page book-phantom";
  return el;
}

/** The parts of page-flip's internals let go on unmount. Read from its src (Render.ts, UI.ts, PageCollection.ts). */
interface Internals {
  render?: { render?: (t: number) => void; leftPage?: unknown; rightPage?: unknown; flippingPage?: unknown; bottomPage?: unknown; shadow?: unknown };
  ui?: { removeHandlers?: () => void; items?: unknown; onMouseMove?: (e: MouseEvent) => void };
  pages?: { destroy?: () => void } | null;
}

function neuter(pf: PageFlip) {
  const inner = pf as unknown as Internals;
  for (const event of ["flip", "changeState", "changeOrientation", "init", "update"]) pf.off(event);
  try {
    pf.destroy();
  } catch {
    // Half-built (unmounted before init): nothing more to tear down.
  }
  const r = inner.render;
  if (r) {
    r.render = () => undefined;
    r.leftPage = r.rightPage = r.flippingPage = r.bottomPage = r.shadow = null;
  }
  inner.ui?.removeHandlers?.();
  if (inner.ui) inner.ui.items = [];
  inner.pages?.destroy?.();
  inner.pages = null;
}

/**
 * page-flip folds a page corner on every mousemove in the window (UI.ts), so a
 * menu or bar over the book's corner lifted the page while the owner picked a
 * paper (user 2026-11-06). Its handler is swapped for one that passes moves
 * only over the book itself, and every move while a press is down, so a drag
 * that strays off the book still follows the pointer. (A press reads
 * `isUserTouch`, not the state: a drag stays "fold_corner" until it has moved
 * 5 px.) Leaving the book with a corner up and no press down sends one far-off
 * move, which lays the corner back down.
 * page-flip removes and re-adds `this.onMouseMove` on each page rebuild, so
 * replacing the property holds for the instance's life.
 */
function guardCornerHover(pf: PageFlip, book: HTMLElement) {
  const ui = (pf as unknown as Internals).ui;
  const pass = ui?.onMouseMove;
  if (!ui || !pass) return;
  const pressed = () => (pf as unknown as { isUserTouch?: boolean }).isUserTouch === true;
  const guarded = (e: MouseEvent) => {
    const state = pf.getState();
    if (pressed() || state === "user_fold" || (e.target instanceof Node && book.contains(e.target))) pass(e);
    else if (state === "fold_corner") pass(new MouseEvent("mousemove", { clientX: -1e5, clientY: -1e5 }));
  };
  window.removeEventListener("mousemove", pass);
  ui.onMouseMove = guarded;
  window.addEventListener("mousemove", guarded);
}

export interface FlipBookProps {
  layout: BookLayout;
  /** A page's height / width. */
  aspect: number;
  startPage: number;
  reduced: boolean;
  zoom: number;
  onSpread: (spread: number) => void;
  /**
   * One page fitted to the width, the stage scrolling down it (a single page
   * on a wide screen: fitted to the height it'd be no bigger than half a
   * spread, and small print stays small).
   */
  fitWidth: boolean;
  /** Height of the translucent bars floating over the top and bottom of the stage: the page starts clear of them. */
  inset: number;
  /** The reader's controls are showing: the edge arrows hide with them. */
  chrome: boolean;
  /** Makes the element page-flip holds for a page (from 1). Called once a page while it stays in the window. */
  makePage: (page: number) => HTMLElement;
  /** A page left the window (or the book closed): let go of what its element holds. */
  dropPage: (page: number, el: HTMLElement) => void;
  /**
   * Pages of text: a click reaches the links on them, and only a page corner
   * turns on a click (the PDF's page images turn on a click anywhere).
   */
  textPages?: boolean;
  /** The room the book is fitted into, in whole px, as it changes. Rendered (and reported) before there are pages. */
  onRoom?: (width: number, height: number) => void;
  /** Fills the open pages: rendered with what's open, so its effects run when that changes. */
  children?: (open: OpenBook) => React.ReactNode;
}

export const FlipBook = React.forwardRef<BookHandle, FlipBookProps>(function FlipBook(
  { layout, aspect, startPage, reduced, zoom, onSpread, fitWidth, inset, chrome, makePage, dropPage, textPages = false, onRoom, children },
  ref,
) {
  const [frameRef, frameWidth] = useElementWidth<HTMLDivElement>();
  const scroller = React.useRef<HTMLDivElement | null>(null);
  const host = React.useRef<HTMLDivElement>(null);
  const flip = React.useRef<PageFlip | null>(null);
  const win = React.useRef<BookWindow>(bookWindow(spreadOf(startPage, layout), layout));
  // One map for the mount, filled and emptied as the window moves; page-filling effects read it.
  const [elements] = React.useState(() => new Map<number, HTMLElement>());
  const rebuilding = React.useRef(false);
  const [spread, setSpread] = React.useState(() => spreadOf(startPage, layout));
  const spreadRef = React.useRef(spread);
  const [rect, setRect] = React.useState<PageRect | null>(null);
  const [held, setHeld] = React.useState(0);
  const live = React.useRef({ onSpread, makePage, dropPage, onRoom });
  React.useLayoutEffect(() => {
    live.current = { onSpread, makePage, dropPage, onRoom };
  });
  const last = spreadCount(layout) - 1;

  const land = React.useCallback((s: number) => {
    spreadRef.current = s;
    setSpread(s);
    live.current.onSpread(s);
  }, []);

  const elementFor = React.useCallback((page: number): HTMLElement => {
    const known = elements.get(page);
    if (known) return known;
    const el = live.current.makePage(page);
    elements.set(page, el);
    return el;
  }, [elements]);

  /** Re-centres the window on a spread and shows it at once (no curl). */
  const rebuild = React.useCallback(
    (s: number) => {
      const pf = flip.current;
      if (!pf) return;
      const next = bookWindow(s, layout);
      const items = next.items.map((p) => (p === PHANTOM ? phantom() : elementFor(p)));
      // Pages outside the new window go, and what they hold with them.
      for (const [p, el] of elements) {
        if (!next.items.includes(p)) {
          live.current.dropPage(p, el);
          elements.delete(p);
        }
      }
      rebuilding.current = true;
      try {
        win.current = next;
        pf.updateFromHtml(items);
        pf.turnToPage(Math.max(0, windowIndex(next, spreadPages(s, layout)[0] ?? 1)));
      } finally {
        rebuilding.current = false;
      }
      land(s);
      // The spread may be the same one, but the window holds new pages beside it: fill them.
      setHeld((h) => h + 1);
    },
    [layout, elementFor, land, elements],
  );

  // The room, reported before page-flip exists: a book of text is laid out to fit it first.
  React.useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    let w = -1;
    let h = -1;
    const report = () => {
      if (el.clientWidth === w && el.clientHeight === h) return;
      w = el.clientWidth;
      h = el.clientHeight;
      live.current.onRoom?.(w, h);
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, []);

  // One page-flip per mount (see the top of the file), once there are pages. Made before the first paint,
  // so a hop to a book shows its pages in the first frame, never an empty stage (V24).
  React.useLayoutEffect(() => {
    const parent = host.current;
    if (!parent || layout.pages <= 0) return;
    const root = document.createElement("div");
    root.className = "size-full";
    parent.appendChild(root);
    const w = win.current;
    const items = w.items.map((p) => (p === PHANTOM ? phantom() : elementFor(p)));
    const pf = new PageFlip(root, {
      size: "stretch",
      width: 1000,
      height: Math.round(1000 * aspect),
      // Spread or single page is the reader's choice (layout.single), not page-flip's guess from width.
      minWidth: layout.single ? 1_000_000 : 1,
      maxWidth: 1_000_000,
      minHeight: 1,
      maxHeight: 1_000_000,
      usePortrait: layout.single,
      autoSize: false,
      showCover: false,
      drawShadow: true,
      maxShadowOpacity: 0.45,
      flippingTime: FLIP_MS,
      mobileScrollSupport: false,
      useMouseEvents: !reduced,
      showPageCorners: !reduced,
      // Text pages: links and buttons get their clicks, and a click turns only at a corner.
      clickEventForward: textPages,
      disableFlipByClick: textPages,
      swipeDistance: 30,
      startZIndex: 0,
      startPage: Math.max(0, windowIndex(w, spreadPages(spreadRef.current, layout)[0] ?? 1)),
    });
    flip.current = pf;
    pf.loadFromHTML(items);
    if (!reduced) guardCornerHover(pf, root);
    // page-flip sizes its root from minWidth and leaves its wrapper (".stf__wrapper", misspelt in its CSS) heightless.
    root.style.minWidth = "0";
    root.style.minHeight = "0";
    root.style.height = "100%";
    const wrapper = root.querySelector<HTMLElement>(".stf__wrapper");
    if (wrapper) wrapper.style.height = "100%";
    pf.update();

    const measure = () => {
      setRect({ ...pf.getBoundsRect() });
    };
    pf.on("init", measure);
    pf.on("flip", (e) => {
      if (rebuilding.current) return;
      const s = spreadAtIndex(win.current, e.data, layout);
      if (s !== spreadRef.current) land(s);
    });
    pf.on("changeState", (e) => {
      if (e.data !== "read") return;
      // A turn landed: if it's at the window's edge, re-centre before the next turn needs the pages beyond.
      const s = spreadRef.current;
      if (needsRebuild(win.current, s, layout)) {
        setTimeout(() => {
          if (flip.current === pf && pf.getState() === "read" && spreadRef.current === s) rebuild(s);
        }, 0);
      }
    });
    const ro = new ResizeObserver(() => {
      pf.update();
      measure();
    });
    ro.observe(parent);
    measure();
    return () => {
      ro.disconnect();
      flip.current = null;
      neuter(pf);
      root.remove();
      for (const [p, el] of elements) live.current.dropPage(p, el);
      elements.clear();
    };
    // Rebuilt only by remount (the reader keys this view by layout and motion).
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const busy = () => flip.current?.getState() === "flipping";

  const go = React.useCallback(
    (target: number, instant = false) => {
      const pf = flip.current;
      const s = Math.min(Math.max(0, target), last);
      if (!pf || s === spreadRef.current || busy()) return;
      const near = Math.abs(s - spreadRef.current) === 1 && s >= win.current.from && s <= win.current.to;
      if (instant || reduced || !near) {
        rebuild(s);
        return;
      }
      if (s > spreadRef.current) pf.flipNext("bottom");
      else pf.flipPrev("bottom");
    },
    [last, reduced, rebuild],
  );

  React.useImperativeHandle(
    ref,
    () => ({
      next: () => {
        go(spreadRef.current + 1);
      },
      prev: () => {
        go(spreadRef.current - 1);
      },
      goTo: (page: number) => {
        go(spreadOf(page, layout));
      },
      jump: (page: number) => {
        go(spreadOf(page, layout), true);
      },
      scroller: () => (fitWidth || zoom > 1 ? scroller.current : null),
      atEnd: () => spreadRef.current >= last,
      turning: () => busy(),
    }),
    [go, layout, fitWidth, zoom, last],
  );

  // Reduced motion: page-flip takes no pointer input, so a swipe or a tap on either half turns at once.
  const swipe = React.useRef<{ x: number; y: number } | null>(null);
  const pointer = reduced
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          // A link or button on a page of text keeps its click.
          swipe.current = textPages && (e.target as Element).closest("a, button") ? null : { x: e.clientX, y: e.clientY };
        },
        onPointerUp: (e: React.PointerEvent) => {
          const from = swipe.current;
          swipe.current = null;
          if (!from) return;
          const dx = e.clientX - from.x;
          if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(e.clientY - from.y)) go(spreadRef.current + (dx < 0 ? 1 : -1));
          else if (Math.abs(dx) < 6) {
            const box = host.current?.getBoundingClientRect();
            if (box) go(spreadRef.current + (e.clientX > box.left + box.width / 2 ? 1 : -1));
          }
        },
      }
    : {};

  // Wherever the box scrolls (fitted to the width, or zoomed), a turn starts at the top of the new page.
  // Auto-scroll leans on it: at the foot it turns, and a box left at the foot would turn again at once.
  // Only a turn: zooming keeps its own place (below).
  const scrolls = fitWidth || zoom > 1;
  const turnedFrom = React.useRef(spread);
  React.useEffect(() => {
    if (turnedFrom.current === spread) return;
    turnedFrom.current = spread;
    if (scrolls && scroller.current) scroller.current.scrollTop = 0;
  }, [scrolls, spread]);

  // Zoom keeps what's in the middle of the view in the middle (user 2026-11-06): from 100% the page zooms
  // in centred, not pinned to the left. The middle is kept as fractions of the scrolled box, read on scroll.
  const middle = React.useRef({ x: 0.5, y: 0.5 });
  const readMiddle = React.useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    middle.current = {
      x: el.scrollWidth > el.clientWidth ? (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth : 0.5,
      y: el.scrollHeight > el.clientHeight ? (el.scrollTop + el.clientHeight / 2) / el.scrollHeight : 0.5,
    };
  }, []);
  React.useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    readMiddle();
    el.addEventListener("scroll", readMiddle, { passive: true });
    return () => {
      el.removeEventListener("scroll", readMiddle);
    };
  }, [readMiddle]);
  const zoomedFrom = React.useRef<number | null>(null);
  React.useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || zoomedFrom.current === zoom) return;
    // A new book already zoomed (spread ↔ one page while zoomed): centred across, at the top of the page.
    if (zoomedFrom.current === null) {
      zoomedFrom.current = zoom;
      if (zoom > 1) el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
      readMiddle();
      return;
    }
    zoomedFrom.current = zoom;
    const { x, y } = middle.current;
    el.scrollLeft = Math.max(0, x * el.scrollWidth - el.clientWidth / 2);
    // Fitted to the width the page already scrolled down: keep that place; otherwise the middle.
    el.scrollTop = Math.max(0, y * el.scrollHeight - el.clientHeight / 2);
    readMiddle();
  }, [zoom, readMiddle]);

  // Zoomed, the page pans (user 2026-11-06): a mouse drags it about, a finger scrolls it natively. page-flip
  // gets no press, move or hover while zoomed (stopped on the way down, before its own listeners), so a pan
  // never folds a corner or turns the page; the arrows, keys and page field still turn.
  const zoomed = zoom > 1;
  React.useEffect(() => {
    const el = scroller.current;
    if (!el || !zoomed) return;
    let drag: { id: number; x: number; y: number; left: number; top: number; moved: boolean } | null = null;
    const block = (e: Event) => {
      e.stopPropagation();
    };
    const down = (e: PointerEvent) => {
      e.stopPropagation();
      // A swallow armed by a pan whose click never came (cancelled) must not eat this press's click.
      el.removeEventListener("click", swallow, { capture: true });
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      e.preventDefault();
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, moved: false };
      el.setPointerCapture(e.pointerId);
      el.style.cursor = "grabbing";
    };
    const end = (id: number) => {
      drag = null;
      el.style.cursor = "";
      if (el.hasPointerCapture(id)) el.releasePointerCapture(id);
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      // The button came up somewhere we never heard of (focus left mid-drag): the drag is over.
      if (e.buttons === 0) {
        end(e.pointerId);
        return;
      }
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true;
      el.scrollLeft = drag.left - dx;
      el.scrollTop = drag.top - dy;
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      // A pan isn't a click: the click that follows it doesn't reach the page (a link on it, say).
      if (drag.moved && e.type === "pointerup") el.addEventListener("click", swallow, { capture: true, once: true });
      end(e.pointerId);
    };
    const lost = (e: PointerEvent) => {
      if (drag && e.pointerId === drag.id) end(e.pointerId);
    };
    const swallow = (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
    };
    const opts = { capture: true };
    const blocked = ["mousedown", "mousemove", "touchstart", "touchmove", "pointerup"] as const;
    el.addEventListener("pointerdown", down, opts);
    el.addEventListener("pointermove", move, opts);
    el.addEventListener("pointerup", up, opts);
    el.addEventListener("pointercancel", up, opts);
    el.addEventListener("lostpointercapture", lost, opts);
    for (const t of blocked) el.addEventListener(t, block, opts);
    return () => {
      el.removeEventListener("pointerdown", down, opts);
      el.removeEventListener("pointermove", move, opts);
      el.removeEventListener("pointerup", up, opts);
      el.removeEventListener("pointercancel", up, opts);
      el.removeEventListener("lostpointercapture", lost, opts);
      el.removeEventListener("click", swallow, opts);
      for (const t of blocked) el.removeEventListener(t, block, opts);
      el.style.cursor = "";
    };
  }, [zoomed]);

  const box = rect && layout.pages > 0 ? visibleBox(rect, layout, spread) : null;
  const before = spreadPages(spread, layout)[0] ?? 1;
  const after = layout.pages - (spreadPages(spread, layout).at(-1) ?? 1);
  const stack = (n: number) => (n <= 0 ? 0 : Math.max(2, Math.min(12, Math.round(2 + Math.log2(n + 1) * 1.4))));
  const pageWidth = rect ? Math.max(64, Math.ceil(rect.pageWidth / 64) * 64) : 0;

  return (
    <div className="relative size-full">
      <div
        ref={(el) => {
          scroller.current = el;
          frameRef(el);
        }}
        className={cn("relative size-full", zoom > 1 ? "overflow-auto overscroll-contain" : fitWidth && "overflow-x-hidden overflow-y-auto overscroll-contain")}
        data-zoomed={zoom > 1 || undefined}
      >
        {/* Clipped (not a scroll box): mid-turn, page-flip sweeps the turning page far past the book's edges (portrait most), which would grow the scroll range and flash a scrollbar on every turn. */}
        <div
          className="relative overflow-clip px-12 sm:px-16"
          style={{
            width: `${String(zoom * 100)}%`,
            paddingTop: inset + FRAME_Y,
            paddingBottom: inset + FRAME_Y,
            height: fitWidth && frameWidth ? Math.round(Math.min(frameWidth * zoom - FRAME_X, FIT_MAX * zoom) * aspect + 2 * (inset + FRAME_Y)) : `${String(zoom * 100)}%`,
          }}
        >
          <div
            ref={host}
            // Zoomed, a finger pans either way; otherwise only down the page (page-flip takes the sideways swipe).
            className={cn("relative size-full", zoomed ? "cursor-grab touch-pan-x touch-pan-y" : "touch-pan-y", layout.single && "book-single")}
            {...pointer}
          >
            {box ? (
              <>
                <span aria-hidden className="book-edge rounded-l-[2px]" style={{ left: box.left - stack(before - 1), top: box.top + 2, width: stack(before - 1), height: box.height - 4 }} />
                <span aria-hidden className="book-edge rounded-r-[2px]" style={{ left: box.left + box.width, top: box.top + 2, width: stack(after), height: box.height - 4 }} />
                <span aria-hidden className="pointer-events-none absolute shadow-[0_18px_48px_-12px] shadow-stage" style={box} />
              </>
            ) : null}
          </div>
        </div>
      </div>
      {layout.pages > 0 ? (
        <>
          <EdgeArrow side="left" inset={inset} shown={chrome} disabled={spread <= 0} onClick={() => { go(spreadRef.current - 1); }} />
          <EdgeArrow side="right" inset={inset} shown={chrome} disabled={spread >= last} onClick={() => { go(spreadRef.current + 1); }} />
        </>
      ) : null}
      {children && pageWidth > 0 ? children({ spread, elements: elements, pageWidth, held }) : null}
    </div>
  );
});

/** The part of page-flip's rect that holds paper: the cover and a lone last page fill only one half. */
function visibleBox(rect: PageRect, layout: BookLayout, spread: number): Box {
  const pw = rect.pageWidth;
  if (layout.single) return { left: rect.left + pw, top: rect.top, width: pw, height: rect.height };
  const pages = spreadPages(spread, layout);
  if (pages.length === 2) return { left: rect.left, top: rect.top, width: 2 * pw, height: rect.height };
  // Page 1 sits on the right; a lone last page on the left.
  return { left: spread === 0 ? rect.left + pw : rect.left, top: rect.top, width: pw, height: rect.height };
}

function EdgeArrow({
  side,
  inset,
  shown,
  disabled,
  onClick,
}: {
  side: "left" | "right";
  inset: number;
  shown: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ top: inset, bottom: inset }}
      disabled={disabled}
      aria-label={side === "left" ? "Previous page" : "Next page"}
      className={cn(
        "group absolute z-10 flex w-10 items-center justify-center text-stage-ink/55 outline-none transition-[color,background-color,opacity] duration-200 sm:w-14",
        !shown && "pointer-events-none opacity-0 focus-visible:pointer-events-auto focus-visible:opacity-100",
        "hover:bg-stage-ink/6 hover:text-stage-ink focus-visible:bg-stage-ink/8 focus-visible:text-stage-ink disabled:pointer-events-none disabled:opacity-0",
        side === "left" ? "left-0 rounded-l-card" : "right-0 rounded-r-card",
      )}
    >
      <Icon aria-hidden className="size-7 transition-transform duration-150 group-active:scale-90" strokeWidth={1.6} />
    </button>
  );
}
