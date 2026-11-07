"use client";

import * as React from "react";
import { Page } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { clampPage, highlightRun, pdfPercent } from "@/lib/reader/book";
import { FOLLOW_LINE_SHARE, directionOf, followScrollTop } from "@/lib/reader/read-along";
import type { SayBoxes } from "./engine";

// The scroll view (V42's alternative to the book): every page in one column,
// but only the pages in view ± 2 exist (V43); the rest are empty slots of
// page 1's shape. Each rendered page carries its text layer, so text can be
// selected and find's matches are marked. react-pdf frees a page's canvas
// when it unmounts.

export interface ScrollHandle {
  next(): void;
  prev(): void;
  goTo(page: number): void;
  /** The element that scrolls. */
  scroller(): HTMLElement | null;
  /** Read-along (V48): where a line (page, y‰) is from the view, null when it shows. */
  where(page: number, y: number): "up" | "down" | null;
  /** Scrolls a line just under the top bar, unless it's already comfortably in view. */
  bring(page: number, y: number, smooth: boolean): void;
}

const GAP = 16;
const MAX_WIDTH = 880;
const OVERSCAN = 2;
const REPORT_MS = 400;

export const ScrollView = React.forwardRef<
  ScrollHandle,
  {
    pdf: PDFDocumentProxy;
    pages: number;
    aspect: number;
    start: { page: number; y: number };
    zoom: number;
    query: string;
    onPlace: (page: number, y: number, percent: number) => void;
    /** The sentence read aloud (V48), boxed on its pages. */
    say: readonly SayBoxes[] | null;
    /** Height of the translucent bars over the top and bottom: the first and last pages rest clear of them. */
    inset: number;
  }
>(function ScrollView({ pdf, pages, aspect, start, zoom, query, onPlace, say, inset }, ref) {
  const scroller = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState({ width: 0, height: 0 });
  const [top, setTop] = React.useState(0);
  const onPlaceRef = React.useRef(onPlace);
  React.useLayoutEffect(() => {
    onPlaceRef.current = onPlace;
  });

  React.useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const read = () => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, []);

  const pageWidth = Math.max(120, Math.round(Math.min(size.width - 32, MAX_WIDTH) * zoom));
  const pageHeight = Math.round(pageWidth * aspect);
  const slot = pageHeight + GAP;
  // Scroll positions count from the first page; the inset only adds room above it and below the last.
  const total = pages * slot;

  const placeAt = React.useCallback(
    (scrollTop: number, viewHeight: number) => {
      const i = Math.min(pages - 1, Math.max(0, Math.floor(scrollTop / slot)));
      const y = Math.min(1000, Math.max(0, ((scrollTop - i * slot) / pageHeight) * 1000));
      const atEnd = scrollTop + viewHeight >= total + 2 * inset - 2;
      return { page: i + 1, y, percent: atEnd ? 100 : pdfPercent(i + 1, y, pages) };
    },
    [pages, slot, pageHeight, total, inset],
  );

  // Resume once the slots have a size: at the page and the part of it last read (V41). And again when zoom or width changes the slots.
  const anchor = React.useRef(start);
  React.useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !size.width) return;
    const { page, y } = anchor.current;
    el.scrollTop = (clampPage(page, pages) - 1) * slot + (y / 1000) * pageHeight;
    setTop(el.scrollTop);
  }, [size.width, slot, pageHeight, pages]);

  // Zoom keeps the middle of the view in the middle across (user 2026-11-06): from 100% the pages zoom in
  // centred, not pinned to the left. Down the page, the place (anchor above) already holds.
  const middleX = React.useRef(0.5);
  React.useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const read = () => {
      middleX.current = el.scrollWidth > el.clientWidth ? (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth : 0.5;
    };
    read();
    el.addEventListener("scroll", read, { passive: true });
    return () => {
      el.removeEventListener("scroll", read);
    };
  }, []);
  React.useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !size.width) return;
    el.scrollLeft = Math.max(0, middleX.current * el.scrollWidth - el.clientWidth / 2);
  }, [pageWidth, size.width]);

  React.useEffect(() => {
    const el = scroller.current;
    if (!el || !size.width) return;
    let last = 0;
    let trailing: ReturnType<typeof setTimeout> | null = null;
    const report = () => {
      const p = placeAt(el.scrollTop, el.clientHeight);
      anchor.current = { page: p.page, y: p.y };
      onPlaceRef.current(p.page, p.y, p.percent);
    };
    report();
    const onScroll = () => {
      setTop(el.scrollTop);
      const now = performance.now();
      if (trailing) clearTimeout(trailing);
      if (now - last >= REPORT_MS) {
        last = now;
        report();
      } else
        trailing = setTimeout(() => {
          last = performance.now();
          report();
        }, REPORT_MS);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (trailing) clearTimeout(trailing);
    };
  }, [size.width, placeAt]);

  /** A line's top in the scrolled content: a page's slot, then its share of the page. */
  const lineTop = React.useCallback(
    (page: number, y: number) => inset + (clampPage(page, pages) - 1) * slot + GAP / 2 + (Math.min(1000, Math.max(0, y)) / 1000) * pageHeight,
    [inset, pages, slot, pageHeight],
  );

  const goTo = React.useCallback(
    (page: number) => {
      const el = scroller.current;
      if (!el) return;
      el.scrollTop = (clampPage(page, pages) - 1) * slot;
    },
    [pages, slot],
  );

  React.useImperativeHandle(
    ref,
    () => ({
      goTo,
      next: () => {
        goTo(anchor.current.page + 1);
      },
      prev: () => {
        // Partway down a page, "previous" goes back to its top first.
        goTo(anchor.current.y > 40 ? anchor.current.page : anchor.current.page - 1);
      },
      scroller: () => scroller.current,
      where: (page, y) => {
        const el = scroller.current;
        if (!el) return null;
        const top = lineTop(page, y);
        return directionOf(top, top + pageHeight * FOLLOW_LINE_SHARE, el.scrollTop + inset, el.scrollTop + el.clientHeight - inset);
      },
      bring: (page, y, smooth) => {
        const el = scroller.current;
        if (!el) return;
        const to = followScrollTop(lineTop(page, y), pageHeight * FOLLOW_LINE_SHARE, el.scrollTop, el.clientHeight, inset);
        if (to !== null) el.scrollTo({ top: to, behavior: smooth ? "smooth" : "instant" });
      },
    }),
    [goTo, lineTop, pageHeight, inset],
  );

  const first = Math.max(0, Math.floor(top / slot) - OVERSCAN);
  const last = Math.min(pages - 1, Math.floor((top + size.height) / slot) + OVERSCAN);
  const shown: number[] = [];
  if (size.width) for (let i = first; i <= last; i++) shown.push(i + 1);

  const renderText = React.useCallback(({ str }: { str: string }) => highlightRun(str, query), [query]);
  const dpr = typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 2);

  return (
    <div ref={scroller} className="relative size-full overflow-auto overscroll-contain [scrollbar-gutter:stable]" tabIndex={-1}>
      <div className="relative mx-auto" style={{ height: total + 2 * inset, width: Math.max(pageWidth + 32, size.width) }}>
        {shown.map((n) => (
          <div
            key={n}
            className="paper-sheet absolute isolate left-1/2 -translate-x-1/2 overflow-hidden bg-paper shadow-[0_10px_30px_-14px] shadow-stage"
            style={{ top: inset + (n - 1) * slot + GAP / 2, width: pageWidth, height: pageHeight }}
          >
            <Page
              pdf={pdf}
              pageNumber={n}
              width={pageWidth}
              devicePixelRatio={dpr}
              renderTextLayer
              renderAnnotationLayer={false}
              {...(query ? { customTextRenderer: renderText } : {})}
              suspense={false}
              loading={<PageNumber n={n} />}
              error={<PageNumber n={n} failed />}
              className="pdf-page [&_mark]:rounded-[2px] [&_mark]:bg-signal/40 [&_mark]:text-transparent"
            />
            {/* The paper colour's wash (paper.tsx); clicks and selection pass through to the text. */}
            <span aria-hidden className="paper-wash" />
            <SayMarks boxes={say?.find((p) => p.page === n)?.boxes} />
          </div>
        ))}
      </div>
    </div>
  );
});

/** The spoken sentence's boxes over a page: absolute, under nothing the owner touches, so neither layout nor selection changes. */
function SayMarks({ boxes }: { boxes: SayBoxes["boxes"] | undefined }) {
  if (!boxes?.length) return null;
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0">
      {boxes.map(([l, t, w, h], i) => (
        <span
          key={i}
          className="absolute rounded-[2px] bg-signal/22"
          style={{ left: `${String(l * 100)}%`, top: `${String(t * 100)}%`, width: `${String(w * 100)}%`, height: `${String(h * 100)}%` }}
        />
      ))}
    </span>
  );
}

function PageNumber({ n, failed = false }: { n: number; failed?: boolean }) {
  return (
    <span className="tabular absolute inset-0 flex items-center justify-center font-mono text-[11px] text-ink-3">
      {failed ? `Page ${String(n)} couldn't be drawn` : n}
    </span>
  );
}
