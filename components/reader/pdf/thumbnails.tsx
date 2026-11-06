"use client";

import * as React from "react";
import { X } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { THUMB_WIDTH, cachedThumb, thumbImage } from "./engine";

// Every page as a small picture, to jump anywhere (V42). Only the rows in
// view exist, and each picture is drawn when its row scrolls in (V43:
// thumbnails are lazy), so a 14,000-page book opens the grid at once.

const CELL_GAP = 14;
const LABEL = 22;

export function Thumbnails({
  pdf,
  pages,
  aspect,
  current,
  onPick,
  onClose,
}: {
  pdf: PDFDocumentProxy;
  pages: number;
  aspect: number;
  /** Pages open now, ringed in the grid. */
  current: readonly number[];
  onPick: (page: number) => void;
  onClose: () => void;
}) {
  const scroller = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState({ width: 0, height: 0 });
  const [top, setTop] = React.useState(0);

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

  const cols = Math.max(2, Math.floor((size.width - 32 + CELL_GAP) / (THUMB_WIDTH + CELL_GAP)));
  const cellH = Math.round(THUMB_WIDTH * aspect) + LABEL;
  const rowH = cellH + CELL_GAP;
  const rows = Math.ceil(pages / cols);

  // Open on the current page's row.
  const first = current[0] ?? 1;
  React.useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !size.width) return;
    el.scrollTop = Math.max(0, Math.floor((first - 1) / cols) * rowH - el.clientHeight / 3);
    setTop(el.scrollTop);
    // Once, when the grid first has a size.
  }, [size.width > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const r0 = Math.max(0, Math.floor(top / rowH) - 1);
  const r1 = Math.min(rows - 1, Math.floor((top + size.height) / rowH) + 1);
  const cells: number[] = [];
  if (size.width) for (let r = r0; r <= r1; r++) for (let c = 0; c < cols; c++) if (r * cols + c < pages) cells.push(r * cols + c + 1);
  const gridW = cols * THUMB_WIDTH + (cols - 1) * CELL_GAP;

  return (
    <div role="dialog" aria-label="All pages" className="absolute inset-0 z-30 flex flex-col bg-stage/96 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
        <p className="font-mono text-[10.5px] tracking-[0.16em] text-stage-ink/60 uppercase">
          All pages · <span className="tabular">{pages}</span>
        </p>
        <button type="button" onClick={onClose} aria-label="Close all pages" className={buttonClass("ghost", "circle-sm", "text-stage-ink/70 hover:bg-stage-ink/10 hover:text-stage-ink dark:hover:bg-stage-ink/10")}>
          <X aria-hidden />
        </button>
      </div>
      <div
        ref={scroller}
        onScroll={(e) => {
          setTop(e.currentTarget.scrollTop);
        }}
        className="relative min-h-0 flex-1 overflow-auto overscroll-contain px-4 pb-6"
      >
        <div className="relative mx-auto" style={{ width: gridW, height: rows * rowH }}>
          {cells.map((n) => {
            const i = n - 1;
            return (
              <Thumb
                key={n}
                pdf={pdf}
                n={n}
                on={current.includes(n)}
                style={{ left: (i % cols) * (THUMB_WIDTH + CELL_GAP), top: Math.floor(i / cols) * rowH, width: THUMB_WIDTH, height: cellH }}
                onPick={onPick}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Thumb({ pdf, n, on, style, onPick }: { pdf: PDFDocumentProxy; n: number; on: boolean; style: React.CSSProperties; onPick: (page: number) => void }) {
  const [url, setUrl] = React.useState(() => cachedThumb(n)?.url ?? null);
  React.useEffect(() => {
    if (url) return;
    const ctrl = new AbortController();
    // A short wait, so rows flung past while scrolling are never drawn.
    const t = setTimeout(() => {
      void thumbImage(pdf, n, ctrl.signal).then((img) => {
        if (img && !ctrl.signal.aborted) setUrl(img.url);
      });
    }, 90);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [pdf, n, url]);
  return (
    <button
      type="button"
      onClick={() => {
        onPick(n);
      }}
      className="group absolute flex flex-col items-center gap-1.5 outline-none"
      style={style}
      aria-label={`Page ${String(n)}`}
      aria-current={on || undefined}
    >
      <span
        className={cn(
          "relative block w-full flex-1 rounded-[7px] p-[3px] transition-[transform,background-color] duration-150 group-hover:-translate-y-0.5",
          "group-focus-visible:ring-2 group-focus-visible:ring-ring",
          on ? "bg-signal/45" : "group-hover:bg-stage-ink/10",
        )}
      >
        <span className="block size-full overflow-hidden rounded-[4px] bg-paper">
          {/* A blob URL rendered on this device. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {url ? <img src={url} alt="" draggable={false} className="size-full" /> : null}
        </span>
      </span>
      <span className={cn("tabular font-mono text-[10.5px]", on ? "text-signal" : "text-stage-ink/60")}>{n}</span>
    </button>
  );
}
