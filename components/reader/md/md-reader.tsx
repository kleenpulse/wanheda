"use client";

import * as React from "react";
import { AArrowDown, AArrowUp, ChevronLeft, ChevronRight, EyeOff, ListTree, Maximize, Minimize, X } from "lucide-react";
import { Tip, TooltipGroup } from "@/components/ui/tooltip";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { normalizeQuery, turnFor } from "@/lib/reader/book";
import { ID_PREFIX, MAX_MATCHES, anchorOf, findRanges, idOf, type MdPlace } from "@/lib/reader/md";
import { formatLocator, parseLocator, type Progress, type ReaderDoc, type ReadingMode } from "@/lib/reader/reader";
import { cn } from "@/lib/utils";
import {
  AutoScrollControl,
  BAR_H,
  Bar,
  BookPagesToggle,
  FindBox,
  ICON_BUTTON,
  ModeSwitch,
  PageField,
  ShowControls,
  Stage,
  autoSpeedPref,
  bookPagesPref,
  useAutoScroll,
  useChrome,
  useStage,
} from "../chrome";
import { onForget } from "../doc-cache";
import { type Paper, PaperMenu, paperPref, paperProps } from "../paper";
import { TEXT_SIZES, pageTurnPref, textSizePref } from "../prefs";
import { useResume } from "../resume";
import { useReaderApi } from "../use-reader";
import { MdBook, type BookInfo, type MdBookView } from "./md-book";
import { MdScroll } from "./md-scroll";
import { headingElements, unpaint, type At, type MdView } from "./view";

// The Markdown and text reader (T48, T49) on the PDF reader's dark stage,
// with the same bars, find, paper colours and auto-scroll. Two views, one
// tap apart and remembered per document (V42): a scroll down one sheet of
// paper (md-scroll.tsx) and a book of pages (md-book.tsx). Both keep one
// place, a heading and how far through that section (V41:
// `md:<heading>:<y‰>`), so it resumes in the same part of the same section in
// either view, on any width or text size. A table of contents lists the
// headings. Text files read the same way, with no headings.

/** Under this stage width the contents close after a pick. */
const NARROW = 768;


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


function Reader({ doc, text }: { doc: ReaderDoc; text: string }) {
  const api = useReaderApi();
  // Reduced motion, or Settings → Reader's "instant" page turn: no curl.
  const reducedMotion = useReducedMotion();
  const reduced = pageTurnPref.use() === "instant" || reducedMotion;
  const mode: ReadingMode = doc.mode;
  const book = mode === "flip";
  const [start] = React.useState(() => startPlace(doc));
  const place = React.useRef<MdPlace>(start);
  const scrollView = React.useRef<MdView>(null);
  const bookView = React.useRef<MdBookView>(null);
  /** The element holding the rendered text: the scroll's sheet, or the book's hidden flow. */
  const [article, setArticle] = React.useState<HTMLElement | null>(null);
  const [headings, setHeadings] = React.useState<Heading[]>([]);
  // A view's text arrived (or went): its headings make the contents, the same in either view.
  const onArticle = React.useCallback((el: HTMLElement | null) => {
    setArticle(el);
    if (!el) return;
    setHeadings(
      headingElements(el).flatMap((h) => {
        const anchor = anchorOf(h.id);
        return anchor === null ? [] : [{ anchor, text: h.textContent || "Untitled", level: Number(h.tagName.slice(1)) }];
      }),
    );
  }, []);
  const articleRef = React.useRef<HTMLElement | null>(null);
  React.useLayoutEffect(() => {
    articleRef.current = article;
  });
  const [at, setAt] = React.useState<At>({ heading: start.heading, percent: doc.progress?.percent ?? 0, top: true });
  const percentRef = React.useRef(at.percent);
  const [bookInfo, setBookInfo] = React.useState<BookInfo | null>(null);
  const bookPages = bookPagesPref.use();
  const [panel, setPanel] = React.useState<"toc" | null>(null);
  const scale = textSizePref.use();

  // ── Stage, paper, auto-scroll, controls ──
  const { stageRef, stageEl, full, toggleFull } = useStage();
  const paper = paperPref.use();
  const [paperPreview, setPaperPreview] = React.useState<Paper | null>(null);
  const paperLook = paperProps(paperPreview ?? paper);
  const [auto, setAuto] = React.useState(false);
  const autoSpeed = autoSpeedPref.use();
  // Auto-scroll moves the scroll only: the book has nothing to scroll.
  const running = auto && panel === null && !book;
  useAutoScroll(
    running,
    "md",
    () => ({ scroller: scrollView.current?.scroller() ?? null, book: null }),
    () => {
      setAuto(false);
    },
  );
  const { chrome, hidden, setHidden, awake, stageEvents, barEvents } = useChrome(running);

  // A place saved later on another device: the view is made again at it (resume.ts; close on the desktop, open on the phone).
  const [resumed, setResumed] = React.useState(0);
  const resume = useResume(doc, stageEl, (next: Progress) => {
    const l = parseLocator(next.locator);
    if (l?.kind !== "md") return;
    if (l.heading === place.current.heading && l.y === place.current.y) return;
    place.current = { heading: l.heading, y: l.y };
    setResumed((n) => n + 1);
  });
  const report = React.useCallback(
    (percent: number) => {
      const p = place.current;
      resume.save(formatLocator({ kind: "md", heading: p.heading, y: p.y }), percent);
    },
    [resume],
  );
  const onAt = React.useCallback((a: At) => {
    percentRef.current = a.percent;
    setAt((prev) => (prev.heading === a.heading && prev.percent === a.percent && prev.top === a.top ? prev : a));
  }, []);

  // The open moves the document up "Continue reading", under the place's own clock (resume.ts). (The view has found the place by now.)
  React.useEffect(() => {
    const p = place.current;
    resume.open(formatLocator({ kind: "md", heading: p.heading, y: p.y }), percentRef.current);
    // Once per open.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setMode = (m: ReadingMode) => {
    if (m !== mode) api.update({ id: doc.id, mode: m });
  };

  /** Shows an element of the text by id, in either view. */
  const jumpTo = React.useCallback(
    (id: string): boolean => {
      const target = articleRef.current?.querySelector(`[id="${CSS.escape(id)}"]`);
      if (!target) return false;
      (book ? bookView.current : scrollView.current)?.show(target);
      return true;
    },
    [book],
  );

  // In-document links (`#section`, footnotes): the sanitizer prefixed the ids they point at.
  const onTextClick = React.useCallback(
    (e: React.MouseEvent) => {
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
    },
    [jumpTo],
  );

  // ── Find ──
  const [findText, setFindText] = React.useState("");
  const [find, setFind] = React.useState<FindState>({ kind: "idle" });
  const finder = React.useRef<{ query: string; ranges: Range[]; index: number } | null>(null);
  const textIndex = React.useRef<TextIndex | null>(null);

  /** The same words again over the text as it is now (its nodes changed, or the view did), keeping the match the owner was on. */
  const refind = React.useCallback(() => {
    const art = articleRef.current;
    const f = finder.current;
    if (!art || !f) return;
    const idx = (textIndex.current = indexText(art));
    const ranges = findRanges(idx.text, f.query).flatMap(([s, e]) => toRange(idx, s, e) ?? []);
    const index = Math.max(0, Math.min(f.index, ranges.length - 1));
    finder.current = { query: f.query, ranges, index };
    (book ? bookView.current : scrollView.current)?.paint(ranges, ranges[index]);
    setFind(ranges.length ? { kind: "hit", index, count: ranges.length } : { kind: "none" });
  }, [book]);

  // Code colours arriving (or anything else) change the text nodes, and a switch of view brings new ones: index again, keep the marks on.
  React.useEffect(() => {
    if (!article) return;
    textIndex.current = null;
    refind();
    let raf = 0;
    const mo = new MutationObserver(() => {
      textIndex.current = null;
      if (!finder.current || raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        refind();
      });
    });
    mo.observe(article, { childList: true, subtree: true, characterData: true });
    return () => {
      mo.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [article, refind]);
  React.useEffect(() => unpaint, []);

  const view = (): MdView | null => (book ? bookView.current : scrollView.current);

  const clearFind = () => {
    finder.current = null;
    view()?.paint([], undefined);
    setFindText("");
    setFind({ kind: "idle" });
  };

  const runFind = (dir: 1 | -1) => {
    setAuto(false);
    const v = view();
    const art = articleRef.current;
    const q = normalizeQuery(findText);
    if (!v || !art) return;
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
        v.paint([], undefined);
        setFind({ kind: "none" });
        return;
      }
      // New words: from where reading is on (or back from it), wrapping round. Matches are in document order.
      const lineY = v.readingY();
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
    v.paint(f.ranges, current);
    setFind({ kind: "hit", index, count: f.ranges.length });
    if (current) v.reveal(current);
  };

  const findStatus =
    find.kind === "hit" ? `${String(find.index + 1)} of ${String(find.count)}${find.count >= MAX_MATCHES ? "+" : ""}` : find.kind === "none" ? "No matches" : null;

  const bumpSize = (dir: 1 | -1) => {
    const i = TEXT_SIZES.indexOf(scale);
    const next = TEXT_SIZES[Math.min(TEXT_SIZES.length - 1, Math.max(0, (i < 0 ? 1 : i) + dir))];
    if (next !== undefined && next !== scale) textSizePref.set(next);
  };

  // Keys: H hides the controls, + and − change the text size. The scroll: ← and → go by section (arrows, Space and
  // Page keys scroll it). The book (V42): ←/→, PageUp/PageDown and Space turn; Home and End go to the first and last page.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, pre, [contenteditable=true], [role=dialog], [role=menu]")) return;
      const v = book ? bookView.current : scrollView.current;
      const turn = turnFor(e.key, e.shiftKey, book);
      if (e.key === "h" || e.key === "H") setHidden((h) => !h);
      else if (e.key === "+" || e.key === "=") bumpSize(1);
      else if (e.key === "-") bumpSize(-1);
      else if (turn === "next") v?.step(1);
      else if (turn === "prev") v?.step(-1);
      else if (turn === "first") bookView.current?.goTo(1);
      else if (turn === "last") bookView.current?.goTo(bookInfo?.pages ?? 1);
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
    // The book's contents cover a page: close them to show the one turned to.
    if (book || (stageEl?.clientWidth ?? 0) < NARROW) setPanel(null);
  };
  const viewProps = {
    text,
    kind: doc.kind === "txt" ? ("txt" as const) : ("md" as const),
    scale,
    placeRef: place,
    onArticle,
    onAt,
    onReport: report,
    title: doc.title,
    onTextClick,
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
          <span className="ml-auto flex shrink-0 items-center gap-2">
            <PaperMenu paper={paper} onPaper={paperPref.set} onPreview={setPaperPreview} container={stageEl} className={ICON_BUTTON} />
            <ModeSwitch mode={mode} onMode={setMode} />
          </span>
        </div>
      </Bar>

      {book ? (
        <MdBook key={resumed} ref={bookView} {...viewProps} reduced={reduced} chrome={chrome} onBook={setBookInfo} />
      ) : (
        <MdScroll key={resumed} ref={scrollView} {...viewProps} aside={panel === "toc"} />
      )}

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
            {book ? (
              <div className="flex items-center gap-0.5">
                <Tip label="Previous" aria-label="Previous page" onClick={() => bookView.current?.step(-1)} disabled={bookInfo?.atStart ?? true} className={ICON_BUTTON}>
                  <ChevronLeft aria-hidden />
                </Tip>
                {bookInfo ? (
                  <PageField
                    field={bookInfo.field}
                    pages={bookInfo.pages}
                    onPage={(page) => {
                      bookView.current?.goTo(page);
                    }}
                  />
                ) : null}
                <Tip label="Next" aria-label="Next page" onClick={() => bookView.current?.step(1)} disabled={bookInfo?.atEnd ?? true} className={ICON_BUTTON}>
                  <ChevronRight aria-hidden />
                </Tip>
              </div>
            ) : (
              <div className="flex min-w-0 items-center gap-0.5">
                {headings.length > 0 ? (
                  <Tip label="Previous section" aria-label="Previous section" onClick={() => scrollView.current?.step(-1)} disabled={at.top} className={ICON_BUTTON}>
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
                  <Tip label="Next section" aria-label="Next section" onClick={() => scrollView.current?.step(1)} disabled={currentIndex >= headings.length - 1} className={ICON_BUTTON}>
                    <ChevronRight aria-hidden />
                  </Tip>
                ) : null}
              </div>
            )}
            <div className="flex items-center justify-end gap-0.5">
              {book ? (
                bookInfo && !bookInfo.narrow ? <BookPagesToggle value={bookPages} onChange={bookPagesPref.set} /> : null
              ) : (
                <AutoScrollControl
                  on={auto}
                  speed={autoSpeed}
                  onToggle={() => {
                    setAuto((a) => !a);
                  }}
                  onSpeed={autoSpeedPref.set}
                />
              )}
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
