"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageFlip, type PageRect } from "page-flip";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  PHANTOM,
  bookWindow,
  needsRebuild,
  pagesToRender,
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
import { anyImage, cachedImage, matchBoxes, pageImage } from "./engine";

// The book (SPEC V42): pdf.js page images in a page-flip spread, curled by
// hand-drawn page-flip 2.0.7 (never react-pageflip).
//
// Two things about page-flip shape this file:
// - Its renderer restyles EVERY page it holds on every animation frame. So it
//   only ever holds a window of a few spreads (lib/reader/book.ts), rebuilt
//   around the open spread when a turn lands at the window's edge.
// - Its rAF loop never stops, not even after destroy(). So there is one
//   instance per mount, and on unmount it is neutered: its draw step becomes
//   a no-op and every page, element and listener it holds is let go, so the
//   orphaned loop does no work and keeps neither the document nor an image.
//
// Pages are <img>, not canvases: in portrait page-flip clones the turning
// page, and a cloned canvas comes out blank.

export interface BookHandle {
  next(): void;
  prev(): void;
  goTo(page: number): void;
  /** The element that scrolls down the page (fitted to the width, or zoomed), or null when the whole page shows. */
  scroller(): HTMLElement | null;
  /** On the last spread: nothing left to turn to. */
  atEnd(): boolean;
  /** A turn is in flight. */
  turning(): boolean;
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

function newPageElement(page: number): HTMLElement {
  const el = document.createElement("div");
  el.className = page === PHANTOM ? "book-page book-phantom" : "book-page paper-sheet";
  if (page === PHANTOM) return el;
  el.dataset.page = String(page);
  const num = document.createElement("span");
  num.className = "tabular absolute inset-0 flex items-center justify-center font-mono text-[11px] text-ink-3";
  num.textContent = String(page);
  const img = document.createElement("img");
  img.alt = "";
  img.draggable = false;
  img.decoding = "async";
  img.className = "paper-ink";
  // The paper colour's wash (paper.tsx): over the page, under the find marks.
  const wash = document.createElement("div");
  wash.className = "paper-wash";
  const hl = document.createElement("div");
  hl.className = "book-hl absolute inset-0";
  const spine = document.createElement("div");
  spine.className = "book-spine";
  el.append(num, img, wash, hl, spine);
  return el;
}

function imgOf(el: HTMLElement | undefined): HTMLImageElement | null {
  return el?.querySelector("img") ?? null;
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

export const BookView = React.forwardRef<
  BookHandle,
  {
    pdf: PDFDocumentProxy;
    layout: BookLayout;
    /** Page 1's height / width. */
    aspect: number;
    startPage: number;
    reduced: boolean;
    zoom: number;
    /** Find's query (normalised); its runs are boxed on the rendered pages. */
    query: string;
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
  }
>(function BookView({ pdf, layout, aspect, startPage, reduced, zoom, query, onSpread, fitWidth, inset, chrome }, ref) {
  const [frameRef, frameWidth] = useElementWidth<HTMLDivElement>();
  const scroller = React.useRef<HTMLDivElement | null>(null);
  const host = React.useRef<HTMLDivElement>(null);
  const flip = React.useRef<PageFlip | null>(null);
  const win = React.useRef<BookWindow>(bookWindow(spreadOf(startPage, layout), layout));
  const elements = React.useRef(new Map<number, HTMLElement>());
  const rebuilding = React.useRef(false);
  const [spread, setSpread] = React.useState(() => spreadOf(startPage, layout));
  const spreadRef = React.useRef(spread);
  const [rect, setRect] = React.useState<PageRect | null>(null);
  const onSpreadRef = React.useRef(onSpread);
  React.useLayoutEffect(() => {
    onSpreadRef.current = onSpread;
  });
  const last = spreadCount(layout) - 1;

  const land = React.useCallback((s: number) => {
    spreadRef.current = s;
    setSpread(s);
    onSpreadRef.current(s);
  }, []);

  const elementFor = React.useCallback((page: number): HTMLElement => {
    const known = elements.current.get(page);
    if (known) return known;
    const el = newPageElement(page);
    elements.current.set(page, el);
    return el;
  }, []);

  /** Re-centres the window on a spread and shows it at once (no curl). */
  const rebuild = React.useCallback(
    (s: number) => {
      const pf = flip.current;
      if (!pf) return;
      const next = bookWindow(s, layout);
      const items = next.items.map((p) => (p === PHANTOM ? newPageElement(PHANTOM) : elementFor(p)));
      // Elements outside the new window go: their images are freed.
      for (const [p, el] of elements.current) {
        if (!next.items.includes(p)) {
          imgOf(el)?.removeAttribute("src");
          elements.current.delete(p);
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
    },
    [layout, elementFor, land],
  );

  // One page-flip per mount (see the top of the file).
  React.useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    const root = document.createElement("div");
    root.className = "size-full";
    parent.appendChild(root);
    const w = win.current;
    const items = w.items.map((p) => (p === PHANTOM ? newPageElement(PHANTOM) : elementFor(p)));
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
      clickEventForward: false,
      disableFlipByClick: false,
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
    const elementMap = elements.current;
    return () => {
      ro.disconnect();
      flip.current = null;
      neuter(pf);
      root.remove();
      for (const el of elementMap.values()) imgOf(el)?.removeAttribute("src");
      elementMap.clear();
    };
    // Rebuilt only by remount (the reader keys this view by layout and motion).
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const busy = () => flip.current?.getState() === "flipping";

  const go = React.useCallback(
    (target: number) => {
      const pf = flip.current;
      const s = Math.min(Math.max(0, target), last);
      if (!pf || s === spreadRef.current || busy()) return;
      const near = Math.abs(s - spreadRef.current) === 1 && s >= win.current.from && s <= win.current.to;
      if (reduced || !near) {
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
      scroller: () => (fitWidth || zoom > 1 ? scroller.current : null),
      atEnd: () => spreadRef.current >= last,
      turning: () => busy(),
    }),
    [go, layout, fitWidth, zoom, last],
  );

  // Pages as images: the open spread first, then one either side (V42, V43). Everything else in the window is let go.
  const pageWidth = rect ? Math.max(64, Math.ceil(rect.pageWidth / 64) * 64) : 0;
  React.useEffect(() => {
    if (!pageWidth) return;
    const ctrl = new AbortController();
    const want = pagesToRender(spread, layout);
    const open = spreadPages(spread, layout);
    const order = [...open, ...want.filter((p) => !open.includes(p))];
    for (const [p, el] of elements.current) {
      const img = imgOf(el);
      if (!img) continue;
      if (want.includes(p)) {
        const ready = cachedImage(p, pageWidth) ?? anyImage(p);
        if (ready && img.src !== ready.url) img.src = ready.url;
      } else img.removeAttribute("src");
    }
    const stopped = () => ctrl.signal.aborted;
    void (async () => {
      for (const p of order) {
        if (stopped()) return;
        const got = await pageImage(pdf, p, pageWidth, ctrl.signal);
        const img = imgOf(elements.current.get(p));
        if (got && img && !stopped() && img.src !== got.url) img.src = got.url;
      }
    })();
    return () => {
      ctrl.abort();
    };
  }, [pdf, spread, layout, pageWidth]);

  // Find: box the query's runs on the open spread.
  React.useEffect(() => {
    let live = true;
    const open = spreadPages(spread, layout);
    for (const el of elements.current.values()) el.querySelector(".book-hl")?.replaceChildren();
    if (!query) return;
    for (const p of open) {
      void matchBoxes(pdf, p, query).then((boxes) => {
        const layer = elements.current.get(p)?.querySelector(".book-hl");
        if (!live || !layer) return;
        layer.replaceChildren(
          ...boxes.map(([l, t, w, h]) => {
            const mark = document.createElement("div");
            mark.className = "absolute rounded-[2px] bg-signal/35";
            mark.style.cssText = `left:${String(l * 100)}%;top:${String(t * 100)}%;width:${String(w * 100)}%;height:${String(h * 100)}%`;
            return mark;
          }),
        );
      });
    }
    return () => {
      live = false;
    };
  }, [pdf, spread, layout, query]);

  // Reduced motion: page-flip takes no pointer input, so a swipe or a tap on either half turns at once.
  const swipe = React.useRef<{ x: number; y: number } | null>(null);
  const pointer = reduced
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          swipe.current = { x: e.clientX, y: e.clientY };
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
  const scrolls = fitWidth || zoom > 1;
  React.useEffect(() => {
    if (scrolls && scroller.current) scroller.current.scrollTop = 0;
  }, [scrolls, spread]);

  const box = rect ? visibleBox(rect, layout, spread) : null;
  const before = spreadPages(spread, layout)[0] ?? 1;
  const after = layout.pages - (spreadPages(spread, layout).at(-1) ?? 1);
  const stack = (n: number) => (n <= 0 ? 0 : Math.max(2, Math.min(12, Math.round(2 + Math.log2(n + 1) * 1.4))));

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
          <div ref={host} className={cn("relative size-full touch-pan-y", layout.single && "book-single")} {...pointer}>
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
      <EdgeArrow side="left" inset={inset} shown={chrome} disabled={spread <= 0} onClick={() => { go(spreadRef.current - 1); }} />
      <EdgeArrow side="right" inset={inset} shown={chrome} disabled={spread >= last} onClick={() => { go(spreadRef.current + 1); }} />
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
