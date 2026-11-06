"use client";

import * as React from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronUp,
  ChevronsDown,
  Columns2,
  Eye,
  EyeOff,
  LayoutGrid,
  ListTree,
  Maximize,
  Minimize,
  Minus,
  Pause,
  Plus,
  RectangleVertical,
  ScrollText,
  Search,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { Outline } from "react-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useAccount } from "@/components/shell/account";
import { Tip, TooltipGroup } from "@/components/ui/tooltip";
import { useElementWidth } from "@/hooks/use-element-width";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import {
  ZOOM_STEPS,
  autoScrollSpeed,
  clampPage,
  cleanPageField,
  nextZoom,
  normalizeQuery,
  pageFieldText,
  parsePageField,
  pdfPercent,
  spreadCount,
  spreadOf,
  spreadPages,
  spreadPercent,
  type BookLayout,
} from "@/lib/reader/book";
import { TAB_SPRING } from "@/lib/motion";
import { formatLocator, parseLocator, type ReaderDoc, type ReadingMode } from "@/lib/reader/reader";
import { cn } from "@/lib/utils";
import { hasCover, keepCover } from "../covers";
import { forgetDoc, onForget } from "../doc-cache";
import { useReaderRuntime } from "../reader-provider";
import { createDevicePref } from "../device-pref";
import { STAGE_BOX } from "../stage";
import { useReaderApi } from "../use-reader";
import { BookView, type BookHandle } from "./book-view";
import { coverOf, findPage, firstPageAspect, heldSha, onBroken, openPdf } from "./engine";
import { ScrollView, type ScrollHandle } from "./scroll-view";
import { Thumbnails } from "./thumbnails";

// The PDF reader (T47, V42): a book by default, a scroll one tap away, the
// choice remembered per document. Both views share one place
// (`pdf:<page>:<y‰>`, V41), so switching keeps the page, and one set of
// controls: find above, the page bar below. Loaded only on the client
// (document-view.tsx), with pdf.js.

/** Under this stage width the book shows one page at a time (V42). */
const SINGLE_BELOW = 768;

// Spread or one page on a wide screen (user 2026-11-06: small print reads
// better one page at a time). This device's choice for every PDF.
type BookPages = "spread" | "single";
const bookPagesPref = createDevicePref<BookPages>(
  "wanheda-reader-book-pages",
  (raw) => (raw === "single" ? "single" : "spread"),
  (v) => v,
);

// Auto-scroll (user 2026-11-06): where the stage scrolls, it moves down on its
// own at a speed set on a slider (this device's choice); in the book it turns
// the page at the foot and goes on. Off on every open. The slider stores its
// position, 0–100; autoScrollSpeed turns it into px a second on a curve.
const autoSpeedPref = createDevicePref<number>(
  "wanheda-reader-autoscroll",
  (raw) => {
    const n = Number(raw);
    return raw !== null && Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 50;
  },
  (v) => String(v),
);
/** At the foot of a page, the book waits this long before it turns. */
const AUTO_DWELL_MS = 1200;

/**
 * The bars float over the stage, translucent (user 2026-11-06), so pages
 * scroll under them; the views keep this much room at each end so nothing
 * starts hidden. Fixed, so showing or hiding the bars never resizes the book.
 */
const BAR_H = 56;
/** While auto-scroll runs, the controls fade this long after the pointer stops. */
const IDLE_HIDE_MS = 2000;
/** The controls' fade when hidden; keyboard focus inside still shows them. */
const CHROME_HIDDEN = "pointer-events-none opacity-0 focus-within:pointer-events-auto focus-within:opacity-100";

interface Loaded {
  sha256: string;
  pdf: PDFDocumentProxy;
  pages: number;
  aspect: number;
}

/**
 * The last document opened, so coming back to it paints without a loading
 * frame (V24). Reused only while the engine still holds it open: a failed
 * open of another file, a broken read or a delete closes it there.
 */
let lastLoaded: Loaded | null = null;

function reusable(sha256: string): Loaded | null {
  return lastLoaded?.sha256 === sha256 && heldSha() === sha256 ? lastLoaded : null;
}

onForget((sha256) => {
  if (lastLoaded?.sha256 === sha256) lastLoaded = null;
});

type Place = { page: number; y: number };

function startPlace(doc: ReaderDoc): Place {
  const l = doc.progress ? parseLocator(doc.progress.locator) : null;
  return l?.kind === "pdf" ? { page: l.page, y: l.y } : { page: 1, y: 0 };
}

export default function PdfReader({ doc, file }: { doc: ReaderDoc; file: File }) {
  const demo = useAccount().kind !== "owner";
  const [loaded, setLoaded] = React.useState<Loaded | null>(() => reusable(doc.sha256));
  const [failed, setFailed] = React.useState(false);

  // A read that fails after the open (the device copy went away underneath) closes the document: say so instead of blank pages.
  React.useEffect(
    () =>
      onBroken((sha256) => {
        if (sha256 !== doc.sha256) return;
        // Every cached copy goes, the bytes read included: the next open reads the device afresh.
        forgetDoc(sha256);
        setFailed(true);
      }),
    [doc.sha256],
  );

  React.useEffect(() => {
    if (loaded?.sha256 === doc.sha256) return;
    const run = { live: true };
    void (async () => {
      try {
        const pdf = await openPdf(doc.sha256, file);
        const aspect = await firstPageAspect(pdf);
        const next = { sha256: doc.sha256, pdf, pages: pdf.numPages, aspect };
        lastLoaded = next;
        if (run.live) setLoaded(next);
      } catch {
        if (lastLoaded?.sha256 === doc.sha256) lastLoaded = null;
        if (run.live) setFailed(true);
      }
    })();
    return () => {
      run.live = false;
    };
  }, [doc.sha256, file, loaded?.sha256]);

  // Page one as the library cover, the first time this device opens it.
  React.useEffect(() => {
    if (!loaded) return;
    void (async () => {
      if (await hasCover(doc.sha256, demo)) return;
      const blob = await coverOf(loaded.pdf);
      if (blob) await keepCover(doc.sha256, blob, demo);
    })().catch(() => undefined);
  }, [loaded, doc.sha256, demo]);

  if (failed) {
    return (
      <Stage>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="font-display text-lg text-stage-ink">This PDF can&apos;t be opened</p>
          <p className="max-w-sm text-[13px] text-stage-ink/65">It may be damaged or protected by a password. Password-protected PDFs aren&apos;t supported yet.</p>
        </div>
      </Stage>
    );
  }
  if (!loaded) return <Stage busy />;
  return <Reader key={loaded.sha256} doc={doc} loaded={loaded} />;
}

/** The dark stage the book sits on, in every skin (V42). */
const Stage = React.forwardRef<
  HTMLDivElement,
  { children?: React.ReactNode; busy?: boolean; full?: boolean } & Pick<React.HTMLAttributes<HTMLDivElement>, "onPointerMove" | "onPointerDown" | "onPointerLeave">
>(function Stage({ children, busy, full, ...pointer }, ref) {
  return (
    <div
      ref={ref}
      {...pointer}
      aria-busy={busy || undefined}
      aria-label={busy ? "Opening" : undefined}
      className={cn(
        "relative flex flex-col overflow-hidden bg-stage text-stage-ink",
        full ? "h-svh w-full" : STAGE_BOX,
      )}
    >
      {children}
    </div>
  );
});

function Reader({ doc, loaded }: { doc: ReaderDoc; loaded: Loaded }) {
  const { pdf, pages, aspect } = loaded;
  const runtime = useReaderRuntime();
  const api = useReaderApi();
  const reduced = useReducedMotion();
  const mode: ReadingMode = doc.mode;

  const [place, setPlace] = React.useState<Place>(() => {
    const p = startPlace(doc);
    return { page: clampPage(p.page, pages), y: p.y };
  });
  const placeRef = React.useRef(place);
  const [zoom, setZoom] = React.useState(1);
  const [panel, setPanel] = React.useState<"thumbs" | "outline" | null>(null);
  const [query, setQuery] = React.useState("");

  // Stage size decides spread or single page.
  const [measureRef, width] = useElementWidth<HTMLDivElement>();
  const bookPages = bookPagesPref.use();
  const narrow = width > 0 && width < SINGLE_BELOW;
  const single = narrow || bookPages === "single";
  const layout = React.useMemo<BookLayout>(() => ({ pages, single }), [pages, single]);

  const book = React.useRef<BookHandle>(null);
  const scroll = React.useRef<ScrollHandle>(null);
  const view = (): BookHandle | ScrollHandle | null => (mode === "flip" ? book.current : scroll.current);

  const report = React.useCallback(
    (p: Place, percent: number) => {
      placeRef.current = p;
      setPlace(p);
      runtime.report({ documentId: doc.id, locator: formatLocator({ kind: "pdf", page: p.page, y: p.y }), percent, at: Date.now() });
    },
    [runtime, doc.id],
  );

  // The open itself is a reading event: it moves the document up "Continue reading".
  React.useEffect(() => {
    const p = placeRef.current;
    report(p, pdfPercent(p.page, p.y, pages));
    // Once per open.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onSpread = React.useCallback(
    (s: number) => {
      const open = spreadPages(s, layout);
      // Still on the same page (a resize, a switch back): keep the place within it.
      if (open.includes(placeRef.current.page)) return;
      report({ page: open[0] ?? 1, y: 0 }, spreadPercent(s, layout));
    },
    [layout, report],
  );
  const onScrollPlace = React.useCallback(
    (page: number, y: number, percent: number) => {
      report({ page, y }, percent);
    },
    [report],
  );

  const setMode = (m: ReadingMode) => {
    if (m !== mode) api.update({ id: doc.id, mode: m });
  };
  const goTo = (page: number) => {
    view()?.goTo(clampPage(page, pages));
  };

  // Fullscreen: the whole reader, bars included.
  const stage = React.useRef<HTMLDivElement | null>(null);
  const [full, setFull] = React.useState(false);
  React.useEffect(() => {
    const on = () => {
      setFull(document.fullscreenElement !== null && document.fullscreenElement === stage.current);
    };
    document.addEventListener("fullscreenchange", on);
    return () => {
      document.removeEventListener("fullscreenchange", on);
    };
  }, []);
  // Auto-scroll: only where the stage scrolls, and paused under the grid or the contents.
  const [auto, setAuto] = React.useState(false);
  const autoSpeed = autoSpeedPref.use();
  const canAuto = mode === "scroll" || (single && !narrow) || zoom > 1;
  const autoOn = auto && canAuto;
  const running = autoOn && panel === null;
  const speedRef = React.useRef(autoScrollSpeed(autoSpeed));
  React.useLayoutEffect(() => {
    speedRef.current = autoScrollSpeed(autoSpeed);
  });
  React.useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    let carry = 0;
    let dwellUntil = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const v = view();
      const el = v?.scroller() ?? null;
      if (v && el) {
        const book = "atEnd" in v ? v : null;
        const atFoot = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
        if (book?.turning()) {
          dwellUntil = 0;
        } else if (atFoot) {
          // The end of the document: stop. The foot of a book page: wait a beat, then turn.
          if (!book || book.atEnd()) {
            setAuto(false);
            return;
          }
          if (!dwellUntil) dwellUntil = now + AUTO_DWELL_MS;
          else if (now >= dwellUntil) {
            dwellUntil = 0;
            book.next();
          }
        } else {
          dwellUntil = 0;
          // Whole pixels only: scrollTop drops fractions, so they're carried to the next frame.
          carry += speedRef.current * dt;
          const px = Math.floor(carry);
          if (px > 0) {
            el.scrollTop += px;
            carry -= px;
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
    // view() reads refs; the loop restarts only when it starts, stops or the view changes.
  }, [running, mode, single]); // eslint-disable-line react-hooks/exhaustive-deps

  // The controls: hidden by the eye button (H), or faded while auto-scroll runs and the pointer rests.
  const [hidden, setHidden] = React.useState(false);
  const [awake, setAwake] = React.useState(true);
  const [onBars, setOnBars] = React.useState(false);
  const sleep = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(
    () => () => {
      if (sleep.current) clearTimeout(sleep.current);
    },
    [],
  );
  const wake = () => {
    setAwake(true);
    if (sleep.current) clearTimeout(sleep.current);
    sleep.current = setTimeout(() => {
      setAwake(false);
    }, IDLE_HIDE_MS);
  };
  const doze = () => {
    if (sleep.current) clearTimeout(sleep.current);
    setAwake(false);
  };
  const chrome = !hidden && (!running || awake || onBars);
  const barEvents = {
    onPointerEnter: () => {
      setOnBars(true);
    },
    onPointerLeave: () => {
      setOnBars(false);
    },
  };

  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void stage.current?.requestFullscreen().catch(() => undefined);
  };

  // Keys (V42): ←/→ and PageUp/PageDown turn; Space too in the book (the scroll view keeps its own Space).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      const v = view();
      if (!v) return;
      const flip = mode === "flip";
      if (e.key === "ArrowRight" || (flip && (e.key === "PageDown" || (e.key === " " && !e.shiftKey)))) v.next();
      else if (e.key === "ArrowLeft" || (flip && (e.key === "PageUp" || (e.key === " " && e.shiftKey)))) v.prev();
      else if (e.key === "Home" && flip) v.goTo(1);
      else if (e.key === "End" && flip) v.goTo(pages);
      else if (e.key === "h" || e.key === "H") setHidden((h) => !h);
      else if (e.key === "+" || e.key === "=") setZoom((z) => nextZoom(z, 1));
      else if (e.key === "-") setZoom((z) => nextZoom(z, -1));
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  });

  const spread = spreadOf(place.page, layout);
  const openPages = mode === "flip" ? spreadPages(spread, layout) : [place.page];
  const atStart = mode === "flip" ? spread <= 0 : place.page <= 1;
  const atEnd = mode === "flip" ? spread >= spreadCount(layout) - 1 : place.page >= pages;

  return (
    <Stage
      ref={(el) => {
        stage.current = el;
      }}
      full={full}
      onPointerMove={wake}
      onPointerDown={wake}
      onPointerLeave={doze}
    >
      <div {...barEvents} className={cn("absolute inset-x-0 top-0 z-20 bg-stage/72 backdrop-blur-md transition-opacity duration-200", !chrome && CHROME_HIDDEN)}>
        <TopBar
        pdf={pdf}
        mode={mode}
        onMode={setMode}
        from={place.page}
        outlineOpen={panel === "outline"}
        onOutline={() => {
          setPanel((p) => (p === "outline" ? null : "outline"));
        }}
        onHit={(page, q) => {
          setQuery(q);
          goTo(page);
        }}
        // Searching takes over the page: auto-scroll stops (user 2026-11-06).
        onSearch={() => {
          setAuto(false);
        }}
        onClear={() => {
          setQuery("");
        }}
        />
      </div>
      <div ref={measureRef} className="absolute inset-0">
        {width > 0 ? (
          mode === "flip" ? (
            <BookView
              // A new page-flip for a new shape or motion setting (book-view.tsx).
              key={`${String(single)}:${String(reduced)}`}
              ref={book}
              pdf={pdf}
              layout={layout}
              aspect={aspect}
              startPage={place.page}
              reduced={reduced}
              zoom={zoom}
              query={query}
              onSpread={onSpread}
              fitWidth={single && !narrow}
              inset={BAR_H}
              chrome={chrome}
            />
          ) : (
            <ScrollView ref={scroll} pdf={pdf} pages={pages} aspect={aspect} start={place} zoom={zoom} query={query} onPlace={onScrollPlace} inset={BAR_H} />
          )
        ) : null}
        {panel === "outline" ? (
          <OutlinePanel
            pdf={pdf}
            onPick={(page) => {
              goTo(page);
              if (single) setPanel(null);
            }}
            onClose={() => {
              setPanel(null);
            }}
          />
        ) : null}
      </div>
      <div {...barEvents} className={cn("absolute inset-x-0 bottom-0 z-20 bg-stage/72 backdrop-blur-md transition-opacity duration-200", !chrome && CHROME_HIDDEN)}>
        <BottomBar
        pages={pages}
        field={mode === "flip" ? pageFieldText(spread, layout) : String(place.page)}
        zoom={zoom}
        full={full}
        bookPages={mode === "flip" && !narrow ? bookPages : null}
        onBookPages={bookPagesPref.set}
        auto={canAuto ? { on: autoOn, speed: autoSpeed } : null}
        onAuto={() => {
          setAuto((a) => !a);
        }}
        onAutoSpeed={autoSpeedPref.set}
        atStart={atStart}
        atEnd={atEnd}
        onZoom={(dir) => {
          setZoom((z) => nextZoom(z, dir));
        }}
        onThumbs={() => {
          setPanel((p) => (p === "thumbs" ? null : "thumbs"));
        }}
        onFirst={() => {
          goTo(1);
        }}
        onPrev={() => view()?.prev()}
        onNext={() => view()?.next()}
        onLast={() => {
          goTo(pages);
        }}
        onPage={goTo}
        onFull={toggleFull}
        onHide={() => {
          setHidden(true);
        }}
        />
      </div>
      {hidden ? (
        // The way back: surfaces when the pointer moves, and to keyboard focus.
        <Tip
          label="Show controls"
          aria-label="Show controls (H)"
          onClick={() => {
            setHidden(false);
          }}
          className={cn(
            ICON_BUTTON,
            "absolute right-3 bottom-3 z-30 bg-stage/72 backdrop-blur-md transition-opacity duration-200",
            !awake && "opacity-0 focus-visible:opacity-100",
          )}
        >
          <Eye aria-hidden />
        </Tip>
      ) : null}
      {panel === "thumbs" ? (
        <Thumbnails
          pdf={pdf}
          pages={pages}
          aspect={aspect}
          current={openPages}
          onPick={(page) => {
            setPanel(null);
            goTo(page);
          }}
          onClose={() => {
            setPanel(null);
          }}
        />
      ) : null}
    </Stage>
  );
}

// ── Top bar: contents, find, mode ────────────────────────────────────────

function TopBar({
  pdf,
  mode,
  onMode,
  from,
  outlineOpen,
  onOutline,
  onHit,
  onClear,
  onSearch,
}: {
  pdf: PDFDocumentProxy;
  mode: ReadingMode;
  onMode: (m: ReadingMode) => void;
  from: number;
  outlineOpen: boolean;
  onOutline: () => void;
  onHit: (page: number, query: string) => void;
  onClear: () => void;
  /** The owner started searching: the field took focus, or a search ran. */
  onSearch: () => void;
}) {
  return (
    <div className="flex h-14 items-center gap-2 px-3 sm:px-4">
      <Tip
        label="Contents"
        onClick={onOutline}
        aria-label="Contents"
        aria-pressed={outlineOpen}
        className={cn(ICON_BUTTON, outlineOpen && "bg-stage-ink/12 text-stage-ink")}
      >
        <ListTree aria-hidden />
      </Tip>
      <Find pdf={pdf} from={from} onHit={onHit} onClear={onClear} onSearch={onSearch} />
      <ModeSwitch mode={mode} onMode={onMode} />
    </div>
  );
}

const ICON_BUTTON =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-stage-ink/70 outline-none transition-colors hover:bg-stage-ink/10 hover:text-stage-ink focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-35 active:scale-95 [&_svg]:size-[18px]";

type FindState = { kind: "idle" } | { kind: "searching"; at: number } | { kind: "hit"; page: number; query: string } | { kind: "none"; query: string };

/** Find (V42, both views): the next page holding the words, wrapping round. A hit turns there and marks the words. */
function Find({
  pdf,
  from,
  onHit,
  onClear,
  onSearch,
}: {
  pdf: PDFDocumentProxy;
  from: number;
  onHit: (page: number, query: string) => void;
  onClear: () => void;
  onSearch: () => void;
}) {
  const [text, setText] = React.useState("");
  const [state, setState] = React.useState<FindState>({ kind: "idle" });
  const ctrl = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => ctrl.current?.abort(), []);

  const run = (dir: 1 | -1) => {
    onSearch();
    const q = normalizeQuery(text);
    ctrl.current?.abort();
    if (!q) {
      setState({ kind: "idle" });
      onClear();
      return;
    }
    const c = new AbortController();
    ctrl.current = c;
    // Again with the same words: on from the last hit. New words: from the open page, that page included.
    const start = state.kind === "hit" && state.query === q ? state.page : from - dir;
    setState({ kind: "searching", at: start });
    void findPage(pdf, q, start, dir, c.signal, (at) => {
      if (!c.signal.aborted) setState({ kind: "searching", at });
    }).then((page) => {
      if (c.signal.aborted) return;
      if (page === null) {
        setState({ kind: "none", query: q });
        onClear();
      } else {
        setState({ kind: "hit", page, query: q });
        onHit(page, q);
      }
    });
  };

  const clear = () => {
    ctrl.current?.abort();
    setText("");
    setState({ kind: "idle" });
    onClear();
  };

  const status =
    state.kind === "searching" ? `Searching p. ${String(state.at)}` : state.kind === "hit" ? `Page ${String(state.page)}` : state.kind === "none" ? "No matches" : null;

  return (
    <form
      role="search"
      className="flex h-9 min-w-0 flex-1 items-center gap-1 rounded-pill bg-stage-ink/8 pr-1 pl-3 focus-within:bg-stage-ink/12 sm:max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        run(1);
      }}
    >
      <Search aria-hidden className="size-4 shrink-0 text-stage-ink/55" />
      <input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
        }}
        onFocus={onSearch}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            clear();
          } else if (e.key === "Enter" && e.shiftKey) {
            e.preventDefault();
            run(-1);
          }
        }}
        type="search"
        enterKeyHint="search"
        placeholder="Search this document"
        aria-label="Search this document"
        className="h-full min-w-0 flex-1 bg-transparent px-1.5 text-[13px] text-stage-ink outline-none placeholder:text-stage-ink/45 [&::-webkit-search-cancel-button]:hidden"
      />
      {status ? (
        <span role="status" className={cn("tabular hidden shrink-0 font-mono text-[10.5px] tracking-wide whitespace-nowrap uppercase sm:inline", state.kind === "none" ? "text-stage-ink/50" : "text-signal")}>
          {status}
        </span>
      ) : null}
      {text ? (
        <>
          <button type="button" onClick={() => { run(-1); }} aria-label="Previous match" className={cn(ICON_BUTTON, "size-7 [&_svg]:size-4")}>
            <ChevronUp aria-hidden />
          </button>
          <button type="button" onClick={() => { run(1); }} aria-label="Next match" className={cn(ICON_BUTTON, "size-7 [&_svg]:size-4")}>
            <ChevronDown aria-hidden />
          </button>
          <button type="button" onClick={clear} aria-label="Clear search" className={cn(ICON_BUTTON, "size-7 [&_svg]:size-4")}>
            <X aria-hidden />
          </button>
        </>
      ) : null}
    </form>
  );
}

const MODES: readonly { value: ReadingMode; label: string; icon: typeof BookOpen }[] = [
  { value: "flip", label: "Book", icon: BookOpen },
  { value: "scroll", label: "Scroll", icon: ScrollText },
];

function ModeSwitch({ mode, onMode }: { mode: ReadingMode; onMode: (m: ReadingMode) => void }) {
  const id = React.useId();
  return (
    <div role="group" aria-label="Reading mode" className="ml-auto flex shrink-0 items-center rounded-pill bg-stage-ink/8 p-1">
      {MODES.map((m) => {
        const on = mode === m.value;
        const Icon = m.icon;
        return (
          <button
            key={m.value}
            type="button"
            aria-pressed={on}
            aria-label={m.label}
            onClick={() => {
              onMode(m.value);
            }}
            className={cn(
              "relative isolate inline-flex h-7 items-center gap-1.5 rounded-pill px-2.5 text-[12px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring sm:px-3",
              on ? "text-stage" : "text-stage-ink/65 hover:text-stage-ink",
            )}
          >
            {on ? (
              <motion.span
                layoutId={`${id}-mode`}
                layoutDependency={mode}
                transition={TAB_SPRING}
                aria-hidden
                style={{ borderRadius: 9999 }}
                className="absolute inset-0 -z-10 bg-stage-ink"
              />
            ) : null}
            <Icon aria-hidden className="size-3.5" />
            <span className="hidden sm:inline">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Contents ─────────────────────────────────────────────────────────────

function OutlinePanel({ pdf, onPick, onClose }: { pdf: PDFDocumentProxy; onPick: (page: number) => void; onClose: () => void }) {
  const [empty, setEmpty] = React.useState<boolean | null>(null);
  return (
    <aside aria-label="Contents" style={{ top: BAR_H, bottom: BAR_H }} className="absolute left-0 z-10 flex w-[min(20rem,88%)] flex-col bg-stage/97 shadow-[12px_0_32px_-16px] shadow-stage backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 pt-2 pb-1">
        <p className="font-mono text-[10.5px] tracking-[0.16em] text-stage-ink/60 uppercase">Contents</p>
        <button type="button" onClick={onClose} aria-label="Close contents" className={ICON_BUTTON}>
          <X aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-2 pb-4">
        {empty ? <p className="px-2.5 py-2 text-[13px] text-stage-ink/60">This PDF has no contents list.</p> : null}
        <Outline
          pdf={pdf}
          suspense={false}
          onLoadSuccess={(o) => {
            setEmpty(!o || o.length === 0);
          }}
          onLoadError={() => {
            setEmpty(true);
          }}
          onItemClick={({ pageNumber }) => {
            onPick(pageNumber);
          }}
          className="text-[13px] text-stage-ink/85 [&_a]:block [&_a]:truncate [&_a]:rounded-[8px] [&_a]:px-2.5 [&_a]:py-1.5 [&_a]:outline-none [&_a:focus-visible]:ring-2 [&_a:focus-visible]:ring-ring [&_a:hover]:bg-stage-ink/8 [&_a:hover]:text-stage-ink [&_ul_ul]:pl-3"
        />
      </div>
    </aside>
  );
}

// ── Bottom bar ───────────────────────────────────────────────────────────

function BottomBar({
  pages,
  field,
  zoom,
  full,
  bookPages,
  onBookPages,
  auto,
  onAuto,
  onAutoSpeed,
  atStart,
  atEnd,
  onZoom,
  onThumbs,
  onFirst,
  onPrev,
  onNext,
  onLast,
  onPage,
  onFull,
  onHide,
}: {
  pages: number;
  field: string;
  zoom: number;
  full: boolean;
  /** The spread / one-page choice, or null where it isn't offered (scroll view, narrow screens). */
  bookPages: BookPages | null;
  onBookPages: (v: BookPages) => void;
  /** Auto-scroll, or null where nothing scrolls. */
  auto: { on: boolean; speed: number } | null;
  onAuto: () => void;
  /** The slider's position, 0–100. */
  onAutoSpeed: (position: number) => void;
  atStart: boolean;
  atEnd: boolean;
  onZoom: (dir: 1 | -1) => void;
  onThumbs: () => void;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
  onLast: () => void;
  onPage: (page: number) => void;
  onFull: () => void;
  onHide: () => void;
}) {
  const minZoom = zoom <= ZOOM_STEPS[0];
  const maxZoom = zoom >= (ZOOM_STEPS.at(-1) ?? 1);
  return (
    <TooltipGroup>
      <div className="grid h-14 grid-cols-[1fr_auto_1fr] items-center gap-1 px-2 sm:px-3">
        <div className="flex items-center gap-0.5">
          {/* Zoom hides on phones: the page already fills the width there, and the bar needs the room. */}
          <Tip label="Zoom out" aria-label="Zoom out" onClick={() => { onZoom(-1); }} disabled={minZoom} className={cn(ICON_BUTTON, "hidden sm:inline-flex")}>
            <Minus aria-hidden />
          </Tip>
          <span className="tabular hidden w-11 text-center font-mono text-[11px] text-stage-ink/70 sm:inline" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <Tip label="Zoom in" aria-label="Zoom in" onClick={() => { onZoom(1); }} disabled={maxZoom} className={cn(ICON_BUTTON, "hidden sm:inline-flex")}>
            <Plus aria-hidden />
          </Tip>
          <Tip label="All pages" aria-label="All pages" onClick={onThumbs} className={ICON_BUTTON}>
            <LayoutGrid aria-hidden />
          </Tip>
        </div>
        <div className="flex items-center gap-0.5">
          <Tip label="First page" aria-label="First page" onClick={onFirst} disabled={atStart} className={cn(ICON_BUTTON, "hidden sm:inline-flex")}>
            <ChevronsLeft aria-hidden />
          </Tip>
          <Tip label="Previous" aria-label="Previous page" onClick={onPrev} disabled={atStart} className={ICON_BUTTON}>
            <ChevronLeft aria-hidden />
          </Tip>
          <PageField field={field} pages={pages} onPage={onPage} />
          <Tip label="Next" aria-label="Next page" onClick={onNext} disabled={atEnd} className={ICON_BUTTON}>
            <ChevronRight aria-hidden />
          </Tip>
          <Tip label="Last page" aria-label="Last page" onClick={onLast} disabled={atEnd} className={cn(ICON_BUTTON, "hidden sm:inline-flex")}>
            <ChevronsRight aria-hidden />
          </Tip>
        </div>
        <div className="flex items-center justify-end gap-0.5">
          {auto ? (
            <span className="relative flex items-center">
              {auto.on ? (
                // Inline on wider screens; on a phone it floats above its button, in a glass pill of its own.
                <span className="absolute right-0 bottom-full mb-3 flex items-center rounded-pill bg-stage/80 px-3 py-2.5 backdrop-blur-md sm:static sm:mb-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={auto.speed}
                  onChange={(e) => {
                    onAutoSpeed(Number(e.target.value));
                  }}
                  aria-label="Auto-scroll speed"
                  aria-valuetext={`${String(Math.round(autoScrollSpeed(auto.speed)))} pixels a second`}
                  className="h-1 w-36 cursor-pointer accent-signal sm:mr-1 sm:w-28"
                />
                </span>
              ) : null}
              <Tip
                label={auto.on ? "Stop auto-scroll" : "Auto-scroll"}
                aria-label={auto.on ? "Stop auto-scroll" : "Auto-scroll"}
                aria-pressed={auto.on}
                onClick={onAuto}
                className={cn(ICON_BUTTON, auto.on && "bg-stage-ink/12 text-stage-ink")}
              >
                {auto.on ? <Pause aria-hidden /> : <ChevronsDown aria-hidden />}
              </Tip>
            </span>
          ) : null}
          {bookPages ? (
            <Tip
              label={bookPages === "spread" ? "One page at a time" : "Two-page spread"}
              aria-label={bookPages === "spread" ? "Show one page at a time" : "Show a two-page spread"}
              onClick={() => {
                onBookPages(bookPages === "spread" ? "single" : "spread");
              }}
              className={ICON_BUTTON}
            >
              {bookPages === "spread" ? <RectangleVertical aria-hidden /> : <Columns2 aria-hidden />}
            </Tip>
          ) : null}
          <Tip label="Hide controls (H)" aria-label="Hide controls" onClick={onHide} className={ICON_BUTTON}>
            <EyeOff aria-hidden />
          </Tip>
          <Tip label={full ? "Exit full screen" : "Full screen"} aria-label={full ? "Exit full screen" : "Full screen"} onClick={onFull} className={ICON_BUTTON}>
            {full ? <Minimize aria-hidden /> : <Maximize aria-hidden />}
          </Tip>
        </div>
      </div>
    </TooltipGroup>
  );
}

/** `a-b / N`: shows the open pages; type a page and press Enter to go there. */
function PageField({ field, pages, onPage }: { field: string; pages: number; onPage: (page: number) => void }) {
  const [draft, setDraft] = React.useState<string | null>(null);
  return (
    <form
      className="flex h-9 items-center gap-1.5 rounded-pill bg-stage-ink/8 px-3 focus-within:bg-stage-ink/12"
      onSubmit={(e) => {
        e.preventDefault();
        const page = draft === null ? null : parsePageField(draft, pages);
        setDraft(null);
        (e.currentTarget.elements.namedItem("page") as HTMLInputElement | null)?.blur();
        if (page !== null) onPage(page);
      }}
    >
      <input
        name="page"
        value={draft ?? field}
        onFocus={(e) => {
          setDraft(field);
          e.currentTarget.select();
        }}
        onChange={(e) => {
          setDraft(cleanPageField(e.target.value));
        }}
        onBlur={() => {
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") e.currentTarget.blur();
        }}
        inputMode="numeric"
        autoComplete="off"
        aria-label={`Page, of ${String(pages)}`}
        className="tabular w-[7ch] bg-transparent text-right font-mono text-[12.5px] text-stage-ink outline-none"
        style={{ width: `${String(Math.max(3, (draft ?? field).length + 1))}ch` }}
      />
      <span className="tabular font-mono text-[12.5px] whitespace-nowrap text-stage-ink/50">/ {pages}</span>
    </form>
  );
}
