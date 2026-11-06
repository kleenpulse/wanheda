"use client";

import * as React from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { pagesToRender, spreadPages, type BookLayout } from "@/lib/reader/book";
import { FlipBook, type BookHandle, type OpenBook } from "../flip-book";
import { anyImage, cachedImage, matchBoxes, pageImage, type SayBoxes } from "./engine";

// The PDF book (SPEC V42): pdf.js page images in the shared page-flip book
// (../flip-book.tsx). Pages are <img>, not canvases: in portrait page-flip
// clones the turning page, and a cloned canvas comes out blank.

export type { BookHandle } from "../flip-book";

function newPageElement(page: number): HTMLElement {
  const el = document.createElement("div");
  el.className = "book-page paper-sheet";
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
  // The sentence read aloud (V48), under find's marks.
  const say = document.createElement("div");
  say.className = "book-say pointer-events-none absolute inset-0";
  const hl = document.createElement("div");
  hl.className = "book-hl absolute inset-0";
  const spine = document.createElement("div");
  spine.className = "book-spine";
  el.append(num, img, wash, say, hl, spine);
  return el;
}

function imgOf(el: HTMLElement | undefined): HTMLImageElement | null {
  return el?.querySelector("img") ?? null;
}

function freePage(_page: number, el: HTMLElement) {
  imgOf(el)?.removeAttribute("src");
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
    /** The sentence read aloud, boxed on its pages (V48). */
    say: readonly SayBoxes[] | null;
    onSpread: (spread: number) => void;
    fitWidth: boolean;
    inset: number;
    chrome: boolean;
  }
>(function BookView({ pdf, layout, query, say, ...book }, ref) {
  return (
    <FlipBook ref={ref} layout={layout} makePage={newPageElement} dropPage={freePage} {...book}>
      {(open) => <PdfPages pdf={pdf} layout={layout} query={query} say={say} open={open} />}
    </FlipBook>
  );
});

/** Fills the open pages: images for the spread ± 1, and find's boxes on the spread. */
function PdfPages({ pdf, layout, query, say, open }: { pdf: PDFDocumentProxy; layout: BookLayout; query: string; say: readonly SayBoxes[] | null; open: OpenBook }) {
  const { spread, elements, pageWidth, held } = open;

  // Pages as images: the open spread first, then one either side (V42, V43). Everything else in the window is let go.
  React.useEffect(() => {
    if (!pageWidth) return;
    const ctrl = new AbortController();
    const want = pagesToRender(spread, layout);
    const shown = spreadPages(spread, layout);
    const order = [...shown, ...want.filter((p) => !shown.includes(p))];
    for (const [p, el] of elements) {
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
        const img = imgOf(elements.get(p));
        if (got && img && !stopped() && img.src !== got.url) img.src = got.url;
      }
    })();
    return () => {
      ctrl.abort();
    };
  }, [pdf, spread, layout, pageWidth, elements, held]);

  // Read aloud: the spoken sentence's boxes, on whichever held pages show it.
  React.useEffect(() => {
    for (const [p, el] of elements) {
      const layer = el.querySelector(".book-say");
      if (!layer) continue;
      const boxes = say?.find((b) => b.page === p)?.boxes ?? [];
      layer.replaceChildren(
        ...boxes.map(([l, t, w, h]) => {
          const mark = document.createElement("div");
          mark.className = "absolute rounded-[2px] bg-signal/22";
          mark.style.cssText = `left:${String(l * 100)}%;top:${String(t * 100)}%;width:${String(w * 100)}%;height:${String(h * 100)}%`;
          return mark;
        }),
      );
    }
  }, [say, elements, held]);

  // Find: box the query's runs on the open spread.
  React.useEffect(() => {
    let live = true;
    const shown = spreadPages(spread, layout);
    for (const el of elements.values()) el.querySelector(".book-hl")?.replaceChildren();
    if (!query) return;
    for (const p of shown) {
      void matchBoxes(pdf, p, query).then((boxes) => {
        const layer = elements.get(p)?.querySelector(".book-hl");
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
  }, [pdf, spread, layout, query, elements, held]);

  return null;
}
