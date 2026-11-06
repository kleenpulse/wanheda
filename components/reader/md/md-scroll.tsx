"use client";

import * as React from "react";
import { anchorOf, idOf, lineFor, placeAt, scrollPercent, type Section } from "@/lib/reader/md";
import { cn } from "@/lib/utils";
import { BAR_H } from "../chrome";
import { MdBody, TextBody } from "./md-body";
import { BASE_PX, headingElements, paintRanges, type MdView, type ViewProps } from "./view";

// The scroll view (T48): the document on one sheet of paper down the stage.
// Its place is wherever the reading line falls: a heading and how far through
// that section, so it resumes in the same part of the same section on any
// width or text size.

/** The reading line sits this far under the top bar: the place is wherever it falls. */
const LINE_PAD = 24;
/** A jump puts the heading this far under the top bar, above the reading line. */
const JUMP_PAD = 16;
const REPORT_MS = 400;

export const MdScroll = React.forwardRef<MdView, ViewProps & { aside: boolean }>(function MdScroll(
  { text, kind, scale, placeRef, onArticle, onAt, onReport, onTextClick, title, aside },
  ref,
) {
  const scroller = React.useRef<HTMLDivElement>(null);
  const article = React.useRef<HTMLElement | null>(null);
  const sections = React.useRef<Section[]>([]);
  const live = React.useRef({ onAt, onReport });
  React.useLayoutEffect(() => {
    live.current = { onAt, onReport };
  });

  const articleRef = React.useCallback(
    (el: HTMLElement | null) => {
      article.current = el;
      onArticle(el);
    },
    [onArticle],
  );

  const scaleRef = React.useRef(scale);
  React.useLayoutEffect(() => {
    scaleRef.current = scale;
  });
  /** The width and text size the headings were last measured at. */
  const measuredAt = React.useRef({ width: 0, scale: 0 });
  /** Whether the measured headings still match the text as it is wrapped now. */
  const measuredFits = React.useCallback(() => {
    const art = article.current;
    return art !== null && art.clientWidth === measuredAt.current.width && scaleRef.current === measuredAt.current.scale;
  }, []);

  /** Where each heading starts in the scrolled content. */
  const measure = React.useCallback(() => {
    const el = scroller.current;
    const art = article.current;
    if (!el || !art) return;
    measuredAt.current = { width: art.clientWidth, scale: scaleRef.current };
    const base = el.getBoundingClientRect().top - el.scrollTop;
    const out: Section[] = [];
    for (const h of headingElements(art)) {
      const anchor = anchorOf(h.id);
      if (anchor !== null) out.push({ anchor, top: h.getBoundingClientRect().top - base });
    }
    sections.current = out;
  }, []);

  const readPlace = React.useCallback(() => {
    const el = scroller.current;
    if (!el) return placeRef.current;
    return placeAt(sections.current, el.scrollTop + BAR_H + LINE_PAD, el.scrollHeight);
  }, [placeRef]);

  /** Back to the held place: on open, and whenever the text reflows (width, text size, fonts, code colours). */
  const restore = React.useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const line = lineFor(sections.current, placeRef.current, el.scrollHeight);
    el.scrollTop = line === null ? 0 : Math.max(0, line - BAR_H - LINE_PAD);
  }, [placeRef]);

  const percentNow = React.useCallback(() => {
    const el = scroller.current;
    return el ? scrollPercent(el.scrollTop, el.scrollHeight - el.clientHeight) : 0;
  }, []);

  const tellAt = React.useCallback(() => {
    const el = scroller.current;
    live.current.onAt({ heading: placeRef.current.heading, percent: percentNow(), top: (el?.scrollTop ?? 0) <= 0 });
  }, [placeRef, percentNow]);

  // Open: the headings, then back to the place (V41).
  React.useLayoutEffect(() => {
    measure();
    restore();
    // A heading this file doesn't have resumes from the top: hold the place it landed on.
    placeRef.current = readPlace();
    tellAt();
    scroller.current?.focus({ preventScroll: true });
    // Once per open.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A reflow re-measures the headings. Only a new width or text size, which rewraps
  // everything, puts the reading line back at its ‰ of the section. A change in
  // height alone (an image or code colours arriving) is left to the browser's
  // scroll anchoring, so the text being read stays still (Reviewer FIX, T48).
  React.useLayoutEffect(() => {
    const art = article.current;
    if (!art) return;
    const ro = new ResizeObserver(() => {
      const rewrapped = !measuredFits();
      measure();
      if (rewrapped) restore();
    });
    ro.observe(art);
    return () => {
      ro.disconnect();
    };
  }, [measure, restore, measuredFits]);

  // Scrolling moves the place at once (so a reflow never restores a stale one) and reports it at most every 400 ms.
  React.useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let raf = 0;
    let last = 0;
    let trailing: ReturnType<typeof setTimeout> | null = null;
    const report = () => {
      live.current.onReport(percentNow());
    };
    const onScroll = () => {
      // The text rewrapped and the headings aren't measured yet (the browser's anchoring
      // scrolled first): this position means nothing yet. The ResizeObserver restores the place.
      if (!measuredFits()) return;
      placeRef.current = readPlace();
      raf ||= requestAnimationFrame(() => {
        raf = 0;
        tellAt();
      });
      const now = performance.now();
      if (trailing) clearTimeout(trailing);
      if (now - last >= REPORT_MS) {
        last = now;
        report();
      } else {
        trailing = setTimeout(() => {
          last = performance.now();
          report();
        }, REPORT_MS);
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
      // A switch to the book mid-throttle: the last place still gets saved.
      if (trailing) {
        clearTimeout(trailing);
        report();
      }
    };
  }, [placeRef, readPlace, percentNow, measuredFits, tellAt]);

  /** Scrolls an element of the article to just under the top bar. */
  const show = React.useCallback((target: Element) => {
    const el = scroller.current;
    if (!el || !article.current?.contains(target)) return;
    const base = el.getBoundingClientRect().top - el.scrollTop;
    el.scrollTop = Math.max(0, target.getBoundingClientRect().top - base - BAR_H - JUMP_PAD);
  }, []);

  React.useImperativeHandle(
    ref,
    (): MdView => ({
      show,
      reveal: (range) => {
        const el = scroller.current;
        if (!el) return;
        const r = range.getBoundingClientRect();
        const box = el.getBoundingClientRect();
        if (r.top < box.top + BAR_H + 8 || r.bottom > box.bottom - BAR_H - 8) el.scrollTop += r.top - box.top - el.clientHeight / 3;
      },
      readingY: () => (scroller.current?.getBoundingClientRect().top ?? 0) + BAR_H + LINE_PAD,
      paint: (ranges, current) => {
        paintRanges(ranges, current ? [current] : []);
      },
      /** The next heading, or back to the start of this section (the one before, if already there). */
      step: (dir) => {
        const el = scroller.current;
        const list = sections.current;
        if (!el) return;
        const line = el.scrollTop + BAR_H + LINE_PAD;
        let i = -1;
        for (let k = 0; k < list.length && (list[k]?.top ?? Infinity) <= line; k++) i = k;
        const cur = list[i];
        const target = dir === 1 ? list[i + 1] : cur && line - cur.top > BAR_H ? cur : list[i - 1];
        const heading = target ? article.current?.querySelector(`[id="${CSS.escape(idOf(target.anchor))}"]`) : null;
        if (heading) show(heading);
        else if (dir === -1) el.scrollTop = 0;
      },
      scroller: () => scroller.current,
    }),
    [show],
  );

  return (
    <div
      ref={scroller}
      tabIndex={-1}
      aria-label={title}
      // Scroll anchoring stays on: it holds the text still when content above or below changes height.
      className={cn(
        "absolute inset-0 overflow-x-hidden overflow-y-auto overscroll-contain outline-none [scrollbar-gutter:stable]",
        // Room for the open contents beside the sheet, where there is room.
        aside && "lg:pl-80",
      )}
      style={{ paddingTop: BAR_H + 20, paddingBottom: BAR_H + 40 }}
    >
      <article
        ref={articleRef}
        onClick={onTextClick}
        className="md-sheet mx-auto w-[calc(100%-1.5rem)] max-w-[42em] rounded-[14px] px-5 py-8 sm:px-12 sm:py-12"
        style={{ fontSize: `${String(BASE_PX * scale)}px` }}
      >
        {kind === "md" ? <MdBody text={text} /> : <TextBody text={text} />}
      </article>
    </div>
  );
});
