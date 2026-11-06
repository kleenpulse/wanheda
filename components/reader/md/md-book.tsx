"use client";

import * as React from "react";
import { useElementWidth } from "@/hooks/use-element-width";
import { pageFieldText, pagesToRender, spreadCount, spreadOf, spreadPages, type BookLayout } from "@/lib/reader/book";
import { anchorOf, lineFor, placeAt, type Section } from "@/lib/reader/md";
import { bookPercent, mdPageBox, pageAt, paginate, type FlowBlock, type LineBox, type PageBox, type PageSpan } from "@/lib/reader/md-book";
import { BAR_H, bookPagesPref } from "../chrome";
import { FlipBook, type BookHandle, type OpenBook } from "../flip-book";
import { MdBody, TextBody } from "./md-body";
import { BASE_PX, headingElements, paintRanges, unpaint, type MdView, type ViewProps } from "./view";

// Markdown and text as a book (T49, V42): the same page-flip book as a PDF's
// (../flip-book.tsx), its pages cut from the text.
//
// The text is laid out once, hidden, as one column at the page's text width:
// the flow. lib/reader/md-book.ts cuts the flow into pages without cutting a
// line. A page holds copies of only the blocks it shows, shifted so its
// stretch of the flow sits in the page's window; copies are made for the open
// spread and one either side, and dropped after (V43). The flow stays the
// source: find, the contents and links read it, and find's marks are carried
// over to the copies on the open pages. The place is the reader's one place
// (V41), so it survives a switch to the scroll and back, a new width and a new
// text size: the book opens on the page that holds it.

/** Under this stage width the book shows one page at a time (V42). */
const SINGLE_BELOW = 768;
/** Content changes (an image arriving, code colours) are laid out again after this quiet spell. */
const SETTLE_MS = 120;

/** What the bottom bar shows of the book. */
export interface BookInfo {
  field: string;
  pages: number;
  atStart: boolean;
  atEnd: boolean;
  /** The stage is narrow, or the text fits one page: one page only, so no spread / one-page choice. */
  narrow: boolean;
}

/** The book's own controls, beside the shared view ones. */
export interface MdBookView extends MdView {
  goTo(page: number): void;
}

interface Laid {
  version: number;
  box: PageBox;
  pages: PageSpan[];
  total: number;
  sections: Section[];
  /** The flow's top-level blocks, in order, and where each sits. */
  blocks: HTMLElement[];
  extents: FlowBlock[];
  /** The page holding the reader's place when the book was laid out. */
  start: number;
}

/** A block's lines (and images), as y in the flow. Only read for a block a page break falls in. */
function linesOf(block: HTMLElement | undefined, base: number): LineBox[] {
  if (!block) return [];
  const out: LineBox[] = [];
  const range = document.createRange();
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue?.trim()) continue;
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) if (r.height > 0) out.push({ top: r.top - base, bottom: r.bottom - base });
  }
  for (const el of block.querySelectorAll("img, hr, input, svg")) {
    const r = el.getBoundingClientRect();
    if (r.height > 0) out.push({ top: r.top - base, bottom: r.bottom - base });
  }
  return out.sort((a, b) => a.top - b.top);
}

/** Pairs every text node of a block with its copy's, in order: the copy is a deep clone, so the trees match. */
function pairText(from: Node, to: Node, map: Map<Text, Text>) {
  const a = document.createTreeWalker(from, NodeFilter.SHOW_TEXT);
  const b = document.createTreeWalker(to, NodeFilter.SHOW_TEXT);
  for (let x = a.nextNode(), y = b.nextNode(); x && y; x = a.nextNode(), y = b.nextNode()) map.set(x as Text, y as Text);
}

/** A range over the flow, as the same range over a page's copy, or null when the page doesn't hold it. */
function onPage(r: Range, map: ReadonlyMap<Text, Text>): Range | null {
  const s = map.get(r.startContainer as Text);
  const e = map.get(r.endContainer as Text);
  if (!s || !e) return null;
  const out = document.createRange();
  out.setStart(s, r.startOffset);
  out.setEnd(e, r.endOffset);
  return out;
}

/** The first block ending below y. */
function firstBelow(extents: readonly FlowBlock[], y: number): number {
  let lo = 0;
  let hi = extents.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((extents[mid]?.bottom ?? Infinity) > y) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

export const MdBook = React.forwardRef<
  MdBookView,
  ViewProps & {
    reduced: boolean;
    chrome: boolean;
    onBook: (info: BookInfo) => void;
  }
>(function MdBook({ text, kind, scale, placeRef, onArticle, onAt, onReport, title, reduced, chrome, onBook, onTextClick }, ref) {
  const [measureRef, width] = useElementWidth<HTMLDivElement>();
  const narrow = width > 0 && width < SINGLE_BELOW;
  // Read every render (a hook): never behind the `||`, or turning narrow would skip it.
  const bookPages = bookPagesPref.use();
  const [room, setRoom] = React.useState<{ w: number; h: number } | null>(null);
  const fontSize = BASE_PX * scale;
  /** Bumps when the flow's content or height changes under the same width: lay it out again. */
  const [content, setContent] = React.useState(0);
  // A text that fits one page reads as a single page (user 2026-11-06): a spread would show it in the right
  // half, the left one empty. Decided only from a layout at the spread's page, and kept for that room, text
  // size and content: a single page's wider margins can leave a shorter text column, so the same text may
  // take 2 single pages, and deciding again from that layout would flip back and forth (Reviewer FIX).
  const [fitsOne, setFitsOne] = React.useState<{ w: number; h: number; fontSize: number; text: string; content: number } | null>(null);
  const onePage =
    fitsOne !== null && room !== null && fitsOne.w === room.w && fitsOne.h === room.h && fitsOne.fontSize === fontSize && fitsOne.text === text && fitsOne.content === content;
  const single = narrow || onePage || bookPages === "single";
  const box = React.useMemo(() => (room ? mdPageBox(room.w, room.h, single) : null), [room, single]);
  const textW = box ? box.width - 2 * box.padX : 0;
  const textH = box ? box.height - box.padTop - box.padBottom : 0;

  const flow = React.useRef<HTMLElement | null>(null);
  const bench = React.useRef<HTMLDivElement>(null);
  const book = React.useRef<BookHandle>(null);
  const [laid, setLaid] = React.useState<Laid | null>(null);
  /**
   * The page holding the place, kept with every layout and every turn: a new page-flip (another page
   * count or size, or the motion setting flipped) opens here, never on a page the book has moved on from.
   */
  const [atPage, setAtPage] = React.useState(1);
  const laidRef = React.useRef<Laid | null>(null);
  const spreadRef = React.useRef(0);
  /** Per page filled: flow text node → its copy's. */
  const copies = React.useRef(new Map<number, Map<Text, Text>>());
  const marks = React.useRef<{ ranges: readonly Range[]; current: Range | undefined } | null>(null);
  const live = React.useRef({ onAt, onReport, onBook });
  React.useLayoutEffect(() => {
    live.current = { onAt, onReport, onBook };
  });

  const layout = React.useMemo<BookLayout>(() => ({ pages: laid?.pages.length ?? 0, single }), [laid, single]);
  const layoutRef = React.useRef(layout);
  React.useLayoutEffect(() => {
    layoutRef.current = layout;
  });

  const flowRef = React.useCallback(
    (el: HTMLElement | null) => {
      flow.current = el;
      onArticle(el);
    },
    [onArticle],
  );

  /** The page holding the reader's place in a layout. */
  const heldPage = React.useCallback((l: Laid) => pageAt(l.pages, lineFor(l.sections, placeRef.current, l.total) ?? 0), [placeRef]);

  /** Tells the bars where the book is open. */
  const tell = React.useCallback(
    (s: number) => {
      const l = laidRef.current;
      const lay = layoutRef.current;
      if (!l) return;
      const open = spreadPages(s, lay);
      live.current.onAt({ heading: placeRef.current.heading, percent: bookPercent(open, l.pages, l.total), top: s <= 0 });
      live.current.onBook({ field: pageFieldText(s, lay), pages: lay.pages, atStart: s <= 0, atEnd: s >= spreadCount(lay) - 1, narrow: narrow || lay.pages <= 1 });
    },
    [placeRef, narrow],
  );

  // Lay the flow out into pages: on open, and whenever the page, the text size or the content changes.
  React.useLayoutEffect(() => {
    const el = flow.current;
    if (!el || !box || textH <= 0) return;
    const base = el.getBoundingClientRect().top;
    const blocks = [...el.children] as HTMLElement[];
    const extents = blocks.map((b): FlowBlock => {
      const r = b.getBoundingClientRect();
      return { top: r.top - base, bottom: r.bottom - base, keep: /^H[1-6]$/.test(b.tagName) };
    });
    const total = Math.max(el.getBoundingClientRect().height, extents.at(-1)?.bottom ?? 0);
    const pages = paginate(extents, (i) => linesOf(blocks[i], base), textH, total);
    const sections = headingElements(el).flatMap((h) => {
      const anchor = anchorOf(h.id);
      return anchor === null ? [] : [{ anchor, top: h.getBoundingClientRect().top - base }];
    });
    const next: Omit<Laid, "start" | "version"> = { box, pages, total, sections, blocks, extents };
    const start = heldPage({ ...next, start: 1, version: 0 });
    // Every page held so far shows the old layout: refill.
    copies.current.clear();
    const l: Laid = { ...next, start, version: (laidRef.current?.version ?? 0) + 1 };
    laidRef.current = l;
    setLaid(l);
    setAtPage(start);
    // Laid out at the spread's page: whether it fits one. (A single-page layout never decides it.)
    if (!single && room) setFitsOne(pages.length === 1 ? { w: room.w, h: room.h, fontSize, text, content } : null);
  }, [box, textH, textW, fontSize, content, text, heldPage, single, room]);

  const tellRef = React.useRef(tell);
  React.useLayoutEffect(() => {
    tellRef.current = tell;
  });

  // A new layout opens on the page holding the place. A new page-flip (a new page count or size) starts
  // there; the one already open jumps there at once (never a curl: nothing was turned). Only a new layout:
  // anything else (the stage turning narrow) must not move the book off the page it was turned to.
  React.useLayoutEffect(() => {
    if (!laid) return;
    const s = spreadOf(laid.start, layoutRef.current);
    spreadRef.current = s;
    book.current?.jump(laid.start);
    tellRef.current(s);
  }, [laid]);

  // The bars learn when the stage turns narrow (no spread / one-page choice there).
  React.useEffect(() => {
    tellRef.current(spreadRef.current);
  }, [narrow]);

  // The flow changes under the same width (an image loads, code colours arrive): lay it out again once it settles.
  React.useEffect(() => {
    const el = flow.current;
    if (!el) return;
    // Hidden, a lazy image is never near the screen and never loads: load them all, so the pages measure them.
    for (const img of el.querySelectorAll("img")) img.loading = "eager";
    let t: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (t) return;
      t = setTimeout(() => {
        t = null;
        setContent((c) => c + 1);
      }, SETTLE_MS);
    };
    let size = { w: el.offsetWidth, h: el.offsetHeight };
    const ro = new ResizeObserver(() => {
      const now = { w: el.offsetWidth, h: el.offsetHeight };
      // A new width is a new page size: that lays out again already.
      if (now.w === size.w && now.h !== size.h) bump();
      size = now;
    });
    const mo = new MutationObserver(bump);
    ro.observe(el);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
      if (t) clearTimeout(t);
    };
  }, []);

  const clearPage = React.useCallback((page: number, el: HTMLElement) => {
    el.querySelector(".md-page-text")?.replaceChildren();
    delete el.dataset.laid;
    copies.current.delete(page);
  }, []);

  /** Copies the blocks a page shows into it, placed so its stretch of the flow sits in its window. */
  const fillPage = React.useCallback((page: number, el: HTMLElement) => {
    const l = laidRef.current;
    const span = l?.pages[page - 1];
    const win = el.querySelector<HTMLElement>(".md-page-text");
    const desk = bench.current;
    if (!l || !span || !win || !desk) return;
    const out = document.createElement("div");
    out.className = "md-sheet md-book-flow md-page-flow";
    out.style.cssText = `width:${String(l.box.width - 2 * l.box.padX)}px;font-size:${String(fontSize)}px;--md-page-h:${String(l.box.height - l.box.padTop - l.box.padBottom)}px`;
    const map = new Map<Text, Text>();
    const from = firstBelow(l.extents, span.start);
    let first: FlowBlock | undefined;
    for (let i = from; i < l.blocks.length && (l.extents[i]?.top ?? Infinity) < span.end; i++) {
      const src = l.blocks[i];
      if (!src) continue;
      const copy = src.cloneNode(true) as HTMLElement;
      pairText(src, copy, map);
      out.append(copy);
      first ??= l.extents[i];
    }
    // Ids stay on the flow alone: links and the contents resolve there.
    for (const node of out.querySelectorAll("[id]")) node.removeAttribute("id");
    // Measured off-screen: the first copy may sit lower in its new box than in the flow (its top margin goes).
    desk.append(out);
    const lead = out.firstElementChild ? out.firstElementChild.getBoundingClientRect().top - out.getBoundingClientRect().top : 0;
    out.style.top = `${String((first?.top ?? span.start) - span.start - lead)}px`;
    win.style.height = `${String(span.end - span.start)}px`;
    win.replaceChildren(out);
    el.dataset.laid = String(l.version);
    copies.current.set(page, map);
  }, [fontSize]);

  /** A page's element: the window its stretch of the flow shows through, the page number and the spine's shade. */
  const makePage = React.useCallback((page: number): HTMLElement => {
    const b = laidRef.current?.box;
    const el = document.createElement("div");
    el.className = "book-page md-book-page";
    const win = document.createElement("div");
    win.className = "md-page-text";
    if (b) win.style.cssText = `left:${String(b.padX)}px;top:${String(b.padTop)}px;width:${String(b.width - 2 * b.padX)}px`;
    const folio = document.createElement("span");
    folio.className = "md-folio tabular";
    if (b) folio.style.bottom = `${String(Math.round(b.padX * 0.55))}px`;
    folio.textContent = String(page);
    const spine = document.createElement("div");
    spine.className = "book-spine";
    el.append(win, folio, spine);
    // A page of the open spread or beside it is filled as it's made: page-flip shows it before any effect runs.
    if (pagesToRender(spreadRef.current, layoutRef.current).includes(page)) fillPage(page, el);
    return el;
  }, [fillPage]);

  /** Find's marks, carried from the flow to the copies on the filled pages. */
  const repaint = React.useCallback(() => {
    const m = marks.current;
    if (!m) {
      unpaint();
      return;
    }
    const all: Range[] = [];
    const now: Range[] = [];
    for (const map of copies.current.values()) {
      for (const r of m.ranges) {
        const c = onPage(r, map);
        if (!c) continue;
        all.push(c);
        if (r === m.current) now.push(c);
      }
    }
    paintRanges(all, now);
  }, []);

  /** Fills the open spread and one either side; lets go of the rest (V43). */
  const fillOpen = React.useCallback(
    (open: OpenBook) => {
      const l = laidRef.current;
      if (!l) return;
      const want = pagesToRender(open.spread, layoutRef.current);
      for (const [p, el] of open.elements) {
        if (want.includes(p)) {
          if (el.dataset.laid !== String(l.version)) fillPage(p, el);
        } else if (el.dataset.laid) clearPage(p, el);
      }
      repaint();
    },
    [fillPage, clearPage, repaint],
  );

  const onSpread = React.useCallback(
    (s: number) => {
      spreadRef.current = s;
      const l = laidRef.current;
      if (!l) return;
      const open = spreadPages(s, layoutRef.current);
      // Turned away from the place: the place is now the top of the open spread. (A jump to the
      // place's own page keeps it as it was, so scroll → book → scroll lands where it started.)
      if (!open.includes(heldPage(l))) {
        placeRef.current = placeAt(l.sections, l.pages[(open[0] ?? 1) - 1]?.start ?? 0, l.total);
        live.current.onReport(bookPercent(open, l.pages, l.total));
      }
      setAtPage(heldPage(l));
      tell(s);
    },
    [placeRef, heldPage, tell],
  );

  /** The page a point of the flow (in client y) falls on. */
  const pageOfY = React.useCallback((clientY: number) => {
    const l = laidRef.current;
    const el = flow.current;
    return l && el ? pageAt(l.pages, clientY - el.getBoundingClientRect().top) : 1;
  }, []);

  const showPage = React.useCallback((page: number) => {
    if (!spreadPages(spreadRef.current, layoutRef.current).includes(page)) book.current?.goTo(page);
  }, []);

  React.useImperativeHandle(
    ref,
    (): MdBookView => ({
      show: (target) => {
        if (flow.current?.contains(target)) showPage(pageOfY(target.getBoundingClientRect().top));
      },
      reveal: (range) => {
        showPage(pageOfY(range.getBoundingClientRect().top));
      },
      readingY: () => {
        const l = laidRef.current;
        const first = spreadPages(spreadRef.current, layoutRef.current)[0] ?? 1;
        return (flow.current?.getBoundingClientRect().top ?? 0) + (l?.pages[first - 1]?.start ?? 0);
      },
      paint: (ranges, current) => {
        marks.current = ranges.length > 0 ? { ranges, current } : null;
        repaint();
      },
      step: (dir) => {
        if (dir === 1) book.current?.next();
        else book.current?.prev();
      },
      scroller: () => null,
      goTo: (page) => {
        book.current?.goTo(page);
      },
    }),
    [showPage, pageOfY, repaint],
  );

  return (
    <div ref={measureRef} role="region" className="absolute inset-0" aria-label={title} onClick={onTextClick}>
      {/* The flow: laid out, never seen. inert keeps it out of focus and away from screen readers; the pages are what's read. */}
      <div inert aria-hidden className="pointer-events-none invisible absolute top-0 left-0 h-0 overflow-hidden">
        <article
          ref={flowRef}
          className="md-sheet md-book-flow"
          style={{ width: textW || 480, fontSize, ["--md-page-h" as string]: `${String(textH || 600)}px` }}
        >
          {kind === "md" ? <MdBody text={text} /> : <TextBody text={text} />}
        </article>
        <div ref={bench} />
      </div>
      <FlipBook
        // A new page-flip for a new page count, page size, shape or motion setting (flip-book.tsx).
        key={laid ? `${String(single)}:${String(reduced)}:${String(laid.pages.length)}:${laid.box.width.toFixed(1)}x${laid.box.height.toFixed(1)}` : "room"}
        ref={book}
        layout={layout}
        aspect={laid ? laid.box.height / laid.box.width : 1.4}
        startPage={atPage}
        reduced={reduced}
        zoom={1}
        fitWidth={false}
        inset={BAR_H}
        chrome={chrome}
        onSpread={onSpread}
        makePage={makePage}
        dropPage={clearPage}
        textPages
        onRoom={(w, h) => {
          setRoom((r) => (r?.w === w && r.h === h ? r : { w, h }));
        }}
      >
        {(open) => (laid ? <Fill open={open} version={laid.version} fill={fillOpen} /> : null)}
      </FlipBook>
    </div>
  );
});

/** Fills the open pages before they paint, whenever the spread, the window or the layout changes. */
function Fill({ open, version, fill }: { open: OpenBook; version: number; fill: (open: OpenBook) => void }) {
  const { spread, held, elements, pageWidth } = open;
  React.useLayoutEffect(() => {
    fill({ spread, held, elements, pageWidth });
  }, [spread, held, elements, pageWidth, version, fill]);
  return null;
}
