"use client";

import * as React from "react";
import { AArrowDown, AArrowUp, ChevronLeft, ChevronRight, EyeOff, ListTree, Maximize, Minimize, X } from "lucide-react";
import { Tip, TooltipGroup } from "@/components/ui/tooltip";
import { createDevicePref } from "@/hooks/device-pref";
import { normalizeQuery } from "@/lib/reader/book";
import { ID_PREFIX, MAX_MATCHES, anchorOf, findRanges, idOf, lineFor, placeAt, scrollPercent, type MdPlace, type Section } from "@/lib/reader/md";
import { formatLocator, parseLocator, type ReaderDoc } from "@/lib/reader/reader";
import { cn } from "@/lib/utils";
import { AutoScrollControl, BAR_H, Bar, FindBox, ICON_BUTTON, ShowControls, Stage, autoSpeedPref, useAutoScroll, useChrome, useStage } from "../chrome";
import { onForget } from "../doc-cache";
import { type Paper, PaperMenu, paperPref, paperProps } from "../paper";
import { useReaderRuntime } from "../reader-provider";
import { MdBody, TextBody } from "./md-body";

// The Markdown and text reader (T48): the document on a sheet of paper over
// the PDF reader's dark stage, with the same bars, find, paper colours and
// auto-scroll. Its place is a heading and how far through that section
// (V41: `md:<heading>:<y‰>`), so it resumes in the same part of the same
// section on any width or text size. A table of contents lists the headings.
// Text files read the same way, with no headings.

/** The reading line sits this far under the top bar: the place is wherever it falls. */
const LINE_PAD = 24;
/** A jump puts the heading this far under the top bar, above the reading line. */
const JUMP_PAD = 16;
const REPORT_MS = 400;
/** Under this stage width the contents close after a pick. */
const NARROW = 768;

// Text size (this device, every document): the sheet's type scale.
const TEXT_SIZES: readonly number[] = [0.875, 1, 1.125, 1.25, 1.5];
const textSizePref = createDevicePref<number>(
  "wanheda-reader-text-size",
  (raw) => {
    const n = Number(raw);
    return raw !== null && TEXT_SIZES.includes(n) ? n : 1;
  },
  (v) => (v === 1 ? null : String(v)),
);
const BASE_PX = 17;

/** The text last read, so reopening it paints at once (V24). */
let lastText: { sha256: string; text: string } | null = null;

onForget((sha256) => {
  if (lastText?.sha256 === sha256) lastText = null;
});

function startPlace(doc: ReaderDoc): MdPlace {
  const l = doc.progress ? parseLocator(doc.progress.locator) : null;
  return l?.kind === "md" ? { heading: l.heading, y: l.y } : { heading: "", y: 0 };
}

export function MdReader({ doc, file }: { doc: ReaderDoc; file: File }) {
  const [text, setText] = React.useState<string | null>(() => (lastText?.sha256 === doc.sha256 ? lastText.text : null));
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (text !== null) return;
    let live = true;
    file.text().then(
      (t) => {
        lastText = { sha256: doc.sha256, text: t };
        if (live) setText(t);
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [file, doc.sha256, text]);

  if (failed) {
    return (
      <Stage>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="font-display text-lg text-stage-ink">This file can&apos;t be read</p>
          <p className="max-w-sm text-[13px] text-stage-ink/65">The copy on this device may have been moved or removed.</p>
        </div>
      </Stage>
    );
  }
  if (text === null) return <Stage busy />;
  return <Reader doc={doc} text={text} />;
}

interface Heading {
  anchor: string;
  text: string;
  level: number;
}

type FindState = { kind: "idle" } | { kind: "hit"; index: number; count: number } | { kind: "none" };

/** The article's text, one string, with where each text node starts in it. */
interface TextIndex {
  nodes: Text[];
  starts: number[];
  text: string;
}

/** Blocks whose text never runs on into the next one's: find sees a line break between them. */
const BLOCKS = "p, li, dt, dd, h1, h2, h3, h4, h5, h6, pre, blockquote, th, td, figcaption, div, section, table";

function indexText(root: HTMLElement): TextIndex {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  const starts: number[] = [];
  let text = "";
  let block: Element | null = null;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const own = n.parentElement?.closest(BLOCKS) ?? null;
    // A new block: "end." and "Next" aren't one word, and words in two blocks still match across the break.
    if (own !== block && text.length > 0) text += "\n";
    block = own;
    nodes.push(n as Text);
    starts.push(text.length);
    text += n.nodeValue ?? "";
  }
  return { nodes, starts, text };
}

/** The text node holding an offset: the last starting at or before it (before it, for an end). */
function nodeAt(idx: TextIndex, offset: number, end: boolean): { node: Text; offset: number } | null {
  let lo = 0;
  let hi = idx.starts.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = idx.starts[mid] ?? 0;
    if (end ? s < offset : s <= offset) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  const node = idx.nodes[found];
  return node ? { node, offset: offset - (idx.starts[found] ?? 0) } : null;
}

function toRange(idx: TextIndex, start: number, end: number): Range | null {
  const a = nodeAt(idx, start, false);
  const b = nodeAt(idx, end, true);
  if (!a || !b) return null;
  const r = document.createRange();
  r.setStart(a.node, a.offset);
  r.setEnd(b.node, b.offset);
  return r;
}

// Matches are painted with the CSS Custom Highlight API: no change to the
// document's DOM. Where it isn't supported, find still scrolls to each match.
function highlights(): HighlightRegistry | null {
  return typeof CSS !== "undefined" && "highlights" in CSS ? CSS.highlights : null;
}
function paint(ranges: readonly Range[], current: Range | undefined) {
  const reg = highlights();
  if (!reg) return;
  reg.set("reader-find", new Highlight(...ranges));
  if (current) reg.set("reader-find-now", new Highlight(current));
  else reg.delete("reader-find-now");
}
function unpaint() {
  const reg = highlights();
  reg?.delete("reader-find");
  reg?.delete("reader-find-now");
}

function Reader({ doc, text }: { doc: ReaderDoc; text: string }) {
  const runtime = useReaderRuntime();
  const scroller = React.useRef<HTMLDivElement>(null);
  const article = React.useRef<HTMLElement>(null);
  const sections = React.useRef<Section[]>([]);
  const [start] = React.useState(() => startPlace(doc));
  const place = React.useRef<MdPlace>(start);
  const [headings, setHeadings] = React.useState<Heading[]>([]);
  const [at, setAt] = React.useState({ heading: start.heading, percent: doc.progress?.percent ?? 0, top: true });
  const [panel, setPanel] = React.useState<"toc" | null>(null);
  const scale = textSizePref.use();

  // ── Stage, paper, auto-scroll, controls ──
  const { stageRef, stageEl, full, toggleFull } = useStage();
  const paper = paperPref.use();
  const [paperPreview, setPaperPreview] = React.useState<Paper | null>(null);
  const paperLook = paperProps(paperPreview ?? paper);
  const [auto, setAuto] = React.useState(false);
  const autoSpeed = autoSpeedPref.use();
  const running = auto && panel === null;
  useAutoScroll(
    running,
    "md",
    () => ({ scroller: scroller.current, book: null }),
    () => {
      setAuto(false);
    },
  );
  const { chrome, hidden, setHidden, awake, stageEvents, barEvents } = useChrome(running);

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
    for (const h of art.querySelectorAll<HTMLElement>("h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]")) {
      if (h.closest(".footnotes")) continue;
      const anchor = anchorOf(h.id);
      if (anchor !== null) out.push({ anchor, top: h.getBoundingClientRect().top - base });
    }
    sections.current = out;
  }, []);

  const readPlace = React.useCallback((): MdPlace => {
    const el = scroller.current;
    if (!el) return place.current;
    return placeAt(sections.current, el.scrollTop + BAR_H + LINE_PAD, el.scrollHeight);
  }, []);

  /** Back to the held place: on open, and whenever the text reflows (width, text size, fonts, code colours). */
  const restore = React.useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const line = lineFor(sections.current, place.current, el.scrollHeight);
    el.scrollTop = line === null ? 0 : Math.max(0, line - BAR_H - LINE_PAD);
  }, []);

  const percentNow = React.useCallback(() => {
    const el = scroller.current;
    return el ? scrollPercent(el.scrollTop, el.scrollHeight - el.clientHeight) : 0;
  }, []);

  const report = React.useCallback(() => {
    const p = place.current;
    runtime.report({ documentId: doc.id, locator: formatLocator({ kind: "md", heading: p.heading, y: p.y }), percent: percentNow(), at: Date.now() });
  }, [runtime, doc.id, percentNow]);

  // Open: the headings, then back to the place (V41), then the open itself is a reading event.
  React.useLayoutEffect(() => {
    const art = article.current;
    if (!art) return;
    measure();
    setHeadings(
      [...art.querySelectorAll<HTMLElement>("h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]")]
        .filter((h) => !h.closest(".footnotes"))
        .flatMap((h) => {
          const anchor = anchorOf(h.id);
          return anchor === null ? [] : [{ anchor, text: h.textContent || "Untitled", level: Number(h.tagName.slice(1)) }];
        }),
    );
    restore();
    // A heading this file doesn't have resumes from the top: hold the place it landed on.
    place.current = readPlace();
    scroller.current?.focus({ preventScroll: true });
    // Once per open.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    report();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A reflow re-measures the headings. Only a new width or text size, which rewraps
  // everything, puts the reading line back at its ‰ of the section. A change in
  // height alone (an image or code colours arriving) is left to the browser's
  // scroll anchoring, so the text being read stays still (Reviewer FIX).
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
    const onScroll = () => {
      // The text rewrapped and the headings aren't measured yet (the browser's anchoring
      // scrolled first): this position means nothing yet. The ResizeObserver restores the place.
      if (!measuredFits()) return;
      place.current = readPlace();
      raf ||= requestAnimationFrame(() => {
        raf = 0;
        const next = { heading: place.current.heading, percent: percentNow(), top: el.scrollTop <= 0 };
        setAt((prev) => (prev.heading === next.heading && prev.percent === next.percent && prev.top === next.top ? prev : next));
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
      if (trailing) clearTimeout(trailing);
    };
  }, [readPlace, percentNow, report, measuredFits]);

  /** Scrolls an element of the article to just under the top bar. */
  const jumpTo = React.useCallback((id: string): boolean => {
    const el = scroller.current;
    const target = document.getElementById(id);
    if (!el || !target || !article.current?.contains(target)) return false;
    const base = el.getBoundingClientRect().top - el.scrollTop;
    el.scrollTop = Math.max(0, target.getBoundingClientRect().top - base - BAR_H - JUMP_PAD);
    return true;
  }, []);

  /** The next heading, or back to the start of this section (the one before, if already there). */
  const step = (dir: 1 | -1) => {
    const el = scroller.current;
    const list = sections.current;
    if (!el) return;
    const line = el.scrollTop + BAR_H + LINE_PAD;
    let i = -1;
    for (let k = 0; k < list.length && (list[k]?.top ?? Infinity) <= line; k++) i = k;
    const cur = list[i];
    const target = dir === 1 ? list[i + 1] : cur && line - cur.top > BAR_H ? cur : list[i - 1];
    if (target) jumpTo(idOf(target.anchor));
    else if (dir === -1) el.scrollTop = 0;
  };

  // In-document links (`#section`, footnotes): the sanitizer prefixed the ids they point at.
  const onArticleClick = (e: React.MouseEvent) => {
    const a = (e.target as Element).closest("a");
    const href = a?.getAttribute("href");
    if (!href?.startsWith("#")) return;
    e.preventDefault();
    let id = href.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {
      // Keep it as written.
    }
    if (id && !jumpTo(id.startsWith(ID_PREFIX) ? id : ID_PREFIX + id)) jumpTo(id);
  };

  // ── Find ──
  const [findText, setFindText] = React.useState("");
  const [find, setFind] = React.useState<FindState>({ kind: "idle" });
  const finder = React.useRef<{ query: string; ranges: Range[]; index: number } | null>(null);
  const textIndex = React.useRef<TextIndex | null>(null);

  // Code colours arriving (or anything else) change the text nodes: index again, and keep the marks on.
  React.useEffect(() => {
    const art = article.current;
    if (!art) return;
    let raf = 0;
    const mo = new MutationObserver(() => {
      textIndex.current = null;
      if (!finder.current || raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const f = finder.current;
        if (!f) return;
        const idx = (textIndex.current = indexText(art));
        const ranges = findRanges(idx.text, f.query).flatMap(([s, e]) => toRange(idx, s, e) ?? []);
        const index = Math.min(f.index, ranges.length - 1);
        finder.current = { query: f.query, ranges, index };
        paint(ranges, ranges[index]);
        setFind(ranges.length ? { kind: "hit", index, count: ranges.length } : { kind: "none" });
      });
    });
    mo.observe(art, { childList: true, subtree: true, characterData: true });
    return () => {
      mo.disconnect();
      cancelAnimationFrame(raf);
      unpaint();
    };
  }, []);

  const clearFind = () => {
    finder.current = null;
    unpaint();
    setFindText("");
    setFind({ kind: "idle" });
  };

  const runFind = (dir: 1 | -1) => {
    setAuto(false);
    const el = scroller.current;
    const art = article.current;
    const q = normalizeQuery(findText);
    if (!el || !art) return;
    if (!q) {
      clearFind();
      return;
    }
    let f = finder.current;
    let index: number;
    if (f?.query === q && f.ranges.length > 0) {
      index = (f.index + dir + f.ranges.length) % f.ranges.length;
    } else {
      const idx = (textIndex.current ??= indexText(art));
      const ranges = findRanges(idx.text, q).flatMap(([s, e]) => toRange(idx, s, e) ?? []);
      if (ranges.length === 0) {
        finder.current = { query: q, ranges, index: 0 };
        unpaint();
        setFind({ kind: "none" });
        return;
      }
      // New words: from the reading line on (or back from it), wrapping round. Matches are in document order.
      const lineY = el.getBoundingClientRect().top + BAR_H + LINE_PAD;
      let lo = 0;
      let hi = ranges.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if ((ranges[mid]?.getBoundingClientRect().top ?? 0) < lineY) lo = mid + 1;
        else hi = mid;
      }
      index = dir === 1 ? lo % ranges.length : (lo - 1 + ranges.length) % ranges.length;
      f = { query: q, ranges, index };
    }
    finder.current = { ...f, index };
    const current = f.ranges[index];
    paint(f.ranges, current);
    setFind({ kind: "hit", index, count: f.ranges.length });
    if (current) {
      const r = current.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      if (r.top < box.top + BAR_H + 8 || r.bottom > box.bottom - BAR_H - 8) el.scrollTop += r.top - box.top - el.clientHeight / 3;
    }
  };

  const findStatus =
    find.kind === "hit" ? `${String(find.index + 1)} of ${String(find.count)}${find.count >= MAX_MATCHES ? "+" : ""}` : find.kind === "none" ? "No matches" : null;

  const bumpSize = (dir: 1 | -1) => {
    const i = TEXT_SIZES.indexOf(scale);
    const next = TEXT_SIZES[Math.min(TEXT_SIZES.length - 1, Math.max(0, (i < 0 ? 1 : i) + dir))];
    if (next !== undefined && next !== scale) textSizePref.set(next);
  };

  // Keys: H hides the controls, + and − change the text size, ← and → go by section. The scroller has focus, so arrows, Space and Page keys scroll.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, pre, [contenteditable=true], [role=dialog], [role=menu]")) return;
      if (e.key === "h" || e.key === "H") setHidden((h) => !h);
      else if (e.key === "+" || e.key === "=") bumpSize(1);
      else if (e.key === "-") bumpSize(-1);
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  });

  const currentIndex = headings.findIndex((h) => h.anchor === at.heading);
  const current = headings[currentIndex];
  const pick = (anchor: string) => {
    jumpTo(idOf(anchor));
    if ((stageEl?.clientWidth ?? 0) < NARROW) setPanel(null);
  };

  return (
    <Stage ref={stageRef} full={full} className={paperLook.className} style={paperLook.style} {...stageEvents}>
      <Bar edge="top" shown={chrome} events={barEvents}>
        <div className="flex h-14 items-center gap-2 px-3 sm:px-4">
          {headings.length > 0 ? (
            <Tip
              label="Contents"
              aria-label="Contents"
              aria-pressed={panel === "toc"}
              onClick={() => {
                setPanel((p) => (p === "toc" ? null : "toc"));
              }}
              className={cn(ICON_BUTTON, panel === "toc" && "bg-stage-ink/12 text-stage-ink")}
            >
              <ListTree aria-hidden />
            </Tip>
          ) : null}
          <FindBox
            text={findText}
            onText={setFindText}
            status={findStatus}
            quiet={find.kind === "none"}
            onFind={runFind}
            onClear={clearFind}
            // Searching takes over the page: auto-scroll stops (user 2026-11-06).
            onFocus={() => {
              setAuto(false);
            }}
          />
          <span className="ml-auto flex shrink-0">
            <PaperMenu paper={paper} onPaper={paperPref.set} onPreview={setPaperPreview} container={stageEl} className={ICON_BUTTON} />
          </span>
        </div>
      </Bar>

      <div
        ref={scroller}
        tabIndex={-1}
        aria-label={doc.title}
        // Scroll anchoring stays on: it holds the text still when content above or below changes height.
        className={cn(
          "absolute inset-0 overflow-x-hidden overflow-y-auto overscroll-contain outline-none [scrollbar-gutter:stable]",
          // Room for the open contents beside the sheet, where there is room.
          panel === "toc" && "lg:pl-80",
        )}
        style={{ paddingTop: BAR_H + 20, paddingBottom: BAR_H + 40 }}
      >
        <article
          ref={article}
          onClick={onArticleClick}
          className="md-sheet mx-auto w-[calc(100%-1.5rem)] max-w-[42em] rounded-[14px] px-5 py-8 sm:px-12 sm:py-12"
          style={{ fontSize: `${String(BASE_PX * scale)}px` }}
        >
          {doc.kind === "md" ? <MdBody text={text} /> : <TextBody text={text} />}
        </article>
      </div>

      {panel === "toc" ? (
        <Contents
          headings={headings}
          current={at.heading}
          onPick={pick}
          onClose={() => {
            setPanel(null);
          }}
        />
      ) : null}

      <Bar edge="bottom" shown={chrome} events={barEvents}>
        <TooltipGroup>
          <div className="grid h-14 grid-cols-[1fr_auto_1fr] items-center gap-1 px-2 sm:px-3">
            <div className="flex items-center gap-0.5">
              <Tip label="Smaller text (−)" aria-label="Smaller text" onClick={() => { bumpSize(-1); }} disabled={scale <= (TEXT_SIZES[0] ?? 1)} className={ICON_BUTTON}>
                <AArrowDown aria-hidden />
              </Tip>
              <Tip label="Larger text (+)" aria-label="Larger text" onClick={() => { bumpSize(1); }} disabled={scale >= (TEXT_SIZES.at(-1) ?? 1)} className={ICON_BUTTON}>
                <AArrowUp aria-hidden />
              </Tip>
            </div>
            <div className="flex min-w-0 items-center gap-0.5">
              {headings.length > 0 ? (
                <Tip label="Previous section" aria-label="Previous section" onClick={() => { step(-1); }} disabled={at.top} className={ICON_BUTTON}>
                  <ChevronLeft aria-hidden />
                </Tip>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setPanel((p) => (p === "toc" ? null : "toc"));
                }}
                disabled={headings.length === 0}
                aria-label={current ? `${current.text}, ${String(at.percent)}% read. Contents` : `${String(at.percent)}% read`}
                className="flex h-9 max-w-[min(22rem,34vw)] min-w-0 items-center gap-2 rounded-pill bg-stage-ink/8 px-3 outline-none transition-colors hover:bg-stage-ink/12 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
              >
                {current ? <span className="min-w-0 truncate text-[12.5px] text-stage-ink/85">{current.text}</span> : null}
                <span className="tabular shrink-0 font-mono text-[12.5px] text-stage-ink/55">{at.percent}%</span>
              </button>
              {headings.length > 0 ? (
                <Tip label="Next section" aria-label="Next section" onClick={() => { step(1); }} disabled={currentIndex >= headings.length - 1} className={ICON_BUTTON}>
                  <ChevronRight aria-hidden />
                </Tip>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-0.5">
              <AutoScrollControl
                on={auto}
                speed={autoSpeed}
                onToggle={() => {
                  setAuto((a) => !a);
                }}
                onSpeed={autoSpeedPref.set}
              />
              <Tip label="Hide controls (H)" aria-label="Hide controls" onClick={() => { setHidden(true); }} className={ICON_BUTTON}>
                <EyeOff aria-hidden />
              </Tip>
              {/* Not on phones: no room in the row, and iPhones can't full-screen a page element. */}
              <Tip label={full ? "Exit full screen" : "Full screen"} aria-label={full ? "Exit full screen" : "Full screen"} onClick={toggleFull} className={cn(ICON_BUTTON, "hidden sm:inline-flex")}>
                {full ? <Minimize aria-hidden /> : <Maximize aria-hidden />}
              </Tip>
            </div>
          </div>
        </TooltipGroup>
      </Bar>
      {hidden ? (
        <ShowControls
          awake={awake}
          onShow={() => {
            setHidden(false);
          }}
        />
      ) : null}
    </Stage>
  );
}

/** The table of contents: every heading, indented by level, the one being read marked. */
function Contents({ headings, current, onPick, onClose }: { headings: readonly Heading[]; current: string; onPick: (anchor: string) => void; onClose: () => void }) {
  const list = React.useRef<HTMLElement>(null);
  const top = Math.min(...headings.map((h) => h.level));
  // Open on the heading being read.
  React.useLayoutEffect(() => {
    const nav = list.current;
    const item = nav?.querySelector<HTMLElement>("[aria-current]");
    if (nav && item) nav.scrollTop = item.offsetTop - nav.clientHeight / 2 + item.offsetHeight / 2;
  }, []);
  return (
    <aside aria-label="Contents" style={{ top: BAR_H, bottom: BAR_H }} className="absolute left-0 z-10 flex w-[min(20rem,88%)] flex-col bg-stage/97 shadow-[12px_0_32px_-16px] shadow-stage backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 pt-2 pb-1">
        <p className="font-mono text-[10.5px] tracking-[0.16em] text-stage-ink/60 uppercase">Contents</p>
        <button type="button" onClick={onClose} aria-label="Close contents" className={ICON_BUTTON}>
          <X aria-hidden />
        </button>
      </div>
      <nav ref={list} aria-label="Headings" className="relative min-h-0 flex-1 overflow-auto scroll-fade overscroll-contain px-2 pb-4">
        <ol>
          {headings.map((h) => {
            const on = h.anchor === current;
            return (
              <li key={h.anchor}>
                <button
                  type="button"
                  aria-current={on ? "location" : undefined}
                  onClick={() => {
                    onPick(h.anchor);
                  }}
                  style={{ paddingLeft: `${String(0.625 + (h.level - top) * 0.85)}rem` }}
                  className={cn(
                    "block w-full truncate rounded-[8px] py-1.5 pr-2.5 text-left text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    on ? "bg-stage-ink/10 text-stage-ink" : "text-stage-ink/75 hover:bg-stage-ink/8 hover:text-stage-ink",
                    h.level === top && "font-medium",
                  )}
                >
                  {h.text}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
    </aside>
  );
}
