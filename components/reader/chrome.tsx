"use client";

import * as React from "react";
import { BookOpen, ChevronDown, ChevronUp, ChevronsDown, Columns2, Eye, Pause, RectangleVertical, ScrollText, Search, X } from "lucide-react";
import { motion } from "motion/react";
import { Tip } from "@/components/ui/tooltip";
import { createDevicePref } from "@/hooks/device-pref";
import { autoScrollSpeed, cleanPageField, parsePageField } from "@/lib/reader/book";
import { TAB_SPRING } from "@/lib/motion";
import type { ReadingMode } from "@/lib/reader/reader";
import { cn } from "@/lib/utils";
import { STAGE_BOX } from "./stage";

// The reader's stage and its controls, shared by the PDF reader (T47) and the
// Markdown / text reader (T48, T49): the dark stage, translucent bars that
// float over it and fade while auto-scroll runs, the find box, auto-scroll
// with its speed slider, full screen, the eye that brings hidden controls
// back, and the book's controls: Book / Scroll, spread or one page, and the
// page field.

/**
 * The bars float over the stage, translucent (user 2026-11-06), so pages
 * scroll under them; the views keep this much room at each end so nothing
 * starts hidden. Fixed, so showing or hiding the bars never resizes the page.
 */
export const BAR_H = 56;
/** While auto-scroll runs, the controls fade this long after the pointer stops. */
const IDLE_HIDE_MS = 2000;
/** The controls' fade when hidden; keyboard focus inside still shows them. */
const CHROME_HIDDEN = "pointer-events-none opacity-0 focus-within:pointer-events-auto focus-within:opacity-100";

export const ICON_BUTTON =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-stage-ink/70 outline-none transition-colors hover:bg-stage-ink/10 hover:text-stage-ink focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-35 active:scale-95 [&_svg]:size-[18px]";

/** The dark stage a document sits on, in every skin (V42). */
export const Stage = React.forwardRef<
  HTMLDivElement,
  { children?: React.ReactNode; busy?: boolean; full?: boolean; className?: string | undefined } & Pick<
    React.HTMLAttributes<HTMLDivElement>,
    "onPointerMove" | "onPointerDown" | "onPointerLeave" | "style"
  >
>(function Stage({ children, busy, full, className, ...rest }, ref) {
  return (
    <div
      ref={ref}
      {...rest}
      aria-busy={busy || undefined}
      aria-label={busy ? "Opening" : undefined}
      className={cn("relative flex flex-col overflow-hidden bg-stage text-stage-ink", full ? "h-svh w-full" : STAGE_BOX, className)}
    >
      {children}
    </div>
  );
});

/**
 * The stage element, held as a ref (full screen) and as state (menus render
 * into it, so they still show in full screen), and whether it is full screen.
 */
export function useStage() {
  const stage = React.useRef<HTMLDivElement | null>(null);
  const [stageEl, setStageEl] = React.useState<HTMLDivElement | null>(null);
  const stageRef = React.useCallback((el: HTMLDivElement | null) => {
    stage.current = el;
    setStageEl(el);
  }, []);
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
  const toggleFull = React.useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void stage.current?.requestFullscreen().catch(() => undefined);
  }, []);
  return { stageRef, stageEl, full, toggleFull };
}

/**
 * Whether the controls show: hidden by the eye button (H), or faded while
 * auto-scroll runs and the pointer rests (back on any move or tap, kept while
 * the pointer is on a bar). Spread `stageEvents` on the stage and `barEvents`
 * on each bar.
 */
export function useChrome(running: boolean) {
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
  return {
    chrome: !hidden && (!running || awake || onBars),
    hidden,
    setHidden,
    awake,
    stageEvents: { onPointerMove: wake, onPointerDown: wake, onPointerLeave: doze },
    barEvents: {
      onPointerEnter: () => {
        setOnBars(true);
      },
      onPointerLeave: () => {
        setOnBars(false);
      },
    },
  };
}

/** A translucent bar over the top or bottom of the stage. */
export function Bar({
  edge,
  shown,
  events,
  children,
}: {
  edge: "top" | "bottom";
  shown: boolean;
  events: ReturnType<typeof useChrome>["barEvents"];
  children: React.ReactNode;
}) {
  return (
    <div
      {...events}
      className={cn(
        "absolute inset-x-0 z-20 bg-stage/72 backdrop-blur-md transition-opacity duration-200",
        edge === "top" ? "top-0" : "bottom-0",
        !shown && CHROME_HIDDEN,
      )}
    >
      {children}
    </div>
  );
}

/** The way back from hidden controls: surfaces when the pointer moves, and to keyboard focus. */
export function ShowControls({ awake, onShow }: { awake: boolean; onShow: () => void }) {
  return (
    <Tip
      label="Show controls"
      aria-label="Show controls (H)"
      onClick={onShow}
      className={cn(
        ICON_BUTTON,
        "absolute right-3 bottom-3 z-30 bg-stage/72 backdrop-blur-md transition-opacity duration-200",
        !awake && "opacity-0 focus-visible:opacity-100",
      )}
    >
      <Eye aria-hidden />
    </Tip>
  );
}

// ── Auto-scroll ──────────────────────────────────────────────────────────

// Auto-scroll (user 2026-11-06): where the stage scrolls, it moves down on its
// own at a speed set on a slider (this device's choice, every document). Off
// on every open. The slider stores its position, 0–100; autoScrollSpeed turns
// it into px a second on a curve.
export const autoSpeedPref = createDevicePref<number>(
  "wanheda-reader-autoscroll",
  (raw) => {
    const n = Number(raw);
    return raw !== null && Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 50;
  },
  (v) => String(v),
);

/** A book that turns at the foot of a page instead of stopping there. */
export interface AutoBook {
  turning(): boolean;
  atEnd(): boolean;
  next(): void;
}

/** At the foot of a page, the book waits this long before it turns. */
const AUTO_DWELL_MS = 1200;

/**
 * Moves the scroller down while `running`, at the slider's speed. At the
 * foot: a book waits a beat and turns; anything else (or a book's last page)
 * calls onEnd. `target` is read every frame, so it may change under the loop;
 * the loop restarts only when `running` or `key` changes.
 */
export function useAutoScroll(running: boolean, key: unknown, target: () => { scroller: HTMLElement | null; book: AutoBook | null } | null, onEnd: () => void) {
  const position = autoSpeedPref.use();
  const live = React.useRef({ speed: autoScrollSpeed(position), target, onEnd });
  React.useLayoutEffect(() => {
    live.current = { speed: autoScrollSpeed(position), target, onEnd };
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
      const t = live.current.target();
      const el = t?.scroller ?? null;
      if (t && el) {
        const book = t.book;
        const atFoot = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
        if (book?.turning()) {
          dwellUntil = 0;
        } else if (atFoot) {
          // The end of the document: stop. The foot of a book page: wait a beat, then turn.
          if (!book || book.atEnd()) {
            live.current.onEnd();
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
          carry += live.current.speed * dt;
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
  }, [running, key]);
}

/** Wheel travel (px) per step of the speed slider: a mouse notch (100 px) moves it 2. */
const WHEEL_PX_PER_STEP = 50;

/**
 * The auto-scroll button and, while it runs, its speed slider. The wheel over
 * either changes the speed (user 2026-11-06): up is faster, down slower, and
 * the page under it doesn't scroll.
 */
export function AutoScrollControl({ on, speed, onToggle, onSpeed }: { on: boolean; speed: number; onToggle: () => void; onSpeed: (position: number) => void }) {
  const box = React.useRef<HTMLSpanElement>(null);
  const live = React.useRef({ speed, onSpeed });
  React.useLayoutEffect(() => {
    live.current = { speed, onSpeed };
  });
  React.useEffect(() => {
    const el = box.current;
    if (!on || !el) return;
    let travel = 0;
    // Native and not passive: React's wheel handler can't stop the stage scrolling underneath.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Line and page deltas (some mice, Firefox) as pixels.
      const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      travel -= px;
      const steps = Math.trunc(travel / WHEEL_PX_PER_STEP);
      if (steps === 0) return;
      travel -= steps * WHEEL_PX_PER_STEP;
      const next = Math.min(100, Math.max(0, live.current.speed + steps));
      if (next !== live.current.speed) {
        // Held here too, so several events before the next render keep adding up.
        live.current.speed = next;
        live.current.onSpeed(next);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
    };
  }, [on]);
  return (
    <span ref={box} className="relative flex items-center">
      {on ? (
        // Inline on wider screens; on a phone it floats above its button, in a glass pill of its own.
        <span className="absolute right-0 bottom-full mb-3 flex items-center rounded-pill bg-stage/80 px-3 py-2.5 backdrop-blur-md sm:static sm:mb-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={speed}
            onChange={(e) => {
              onSpeed(Number(e.target.value));
            }}
            aria-label="Auto-scroll speed"
            aria-valuetext={`${String(Math.round(autoScrollSpeed(speed)))} pixels a second`}
            className="h-1 w-36 cursor-pointer accent-signal sm:mr-1 sm:w-28"
          />
        </span>
      ) : null}
      <Tip
        label={on ? "Stop auto-scroll" : "Auto-scroll"}
        aria-label={on ? "Stop auto-scroll" : "Auto-scroll"}
        aria-pressed={on}
        onClick={onToggle}
        className={cn(ICON_BUTTON, on && "bg-stage-ink/12 text-stage-ink")}
      >
        {on ? <Pause aria-hidden /> : <ChevronsDown aria-hidden />}
      </Tip>
    </span>
  );
}

/** The auto-scroll speed on its own, for Settings → Reader: the slider and its speed in px a second. */
export function AutoScrollSpeed({ labelledBy }: { labelledBy: string }) {
  const position = autoSpeedPref.use();
  const speed = Math.round(autoScrollSpeed(position));
  return (
    <span className="flex items-center gap-3">
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={position}
        onChange={(e) => {
          autoSpeedPref.set(Number(e.target.value));
        }}
        aria-labelledby={labelledBy}
        aria-valuetext={`${String(speed)} pixels a second`}
        className="h-1 w-40 cursor-pointer accent-signal"
      />
      <span className="tabular w-16 text-right font-mono text-[12px] text-ink-2">{speed} px/s</span>
    </span>
  );
}

// ── Find ─────────────────────────────────────────────────────────────────

/**
 * The find field: Enter for the next match, Shift+Enter the one before,
 * Escape clears. The reader owns the search; this is only the box.
 */
export function FindBox({
  text,
  onText,
  status,
  quiet,
  onFind,
  onClear,
  onFocus,
}: {
  text: string;
  onText: (text: string) => void;
  /** "Page 12", "3 of 17", "No matches"; null shows nothing. */
  status: string | null;
  /** Status in the muted ink (nothing found) rather than the signal. */
  quiet: boolean;
  onFind: (dir: 1 | -1) => void;
  onClear: () => void;
  onFocus: () => void;
}) {
  return (
    <form
      role="search"
      className="flex h-9 min-w-0 flex-1 items-center gap-1 rounded-pill bg-stage-ink/8 pr-1 pl-3 focus-within:bg-stage-ink/12 sm:max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        onFind(1);
      }}
    >
      <Search aria-hidden className="size-4 shrink-0 text-stage-ink/55" />
      <input
        value={text}
        onChange={(e) => {
          onText(e.target.value);
        }}
        onFocus={onFocus}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClear();
          } else if (e.key === "Enter" && e.shiftKey) {
            e.preventDefault();
            onFind(-1);
          }
        }}
        type="search"
        enterKeyHint="search"
        placeholder="Search this document"
        aria-label="Search this document"
        className="h-full min-w-0 flex-1 bg-transparent px-1.5 text-[13px] text-stage-ink outline-none placeholder:text-stage-ink/45 [&::-webkit-search-cancel-button]:hidden"
      />
      {status ? (
        <span role="status" className={cn("tabular hidden shrink-0 font-mono text-[10.5px] tracking-wide whitespace-nowrap uppercase sm:inline", quiet ? "text-stage-ink/50" : "text-signal")}>
          {status}
        </span>
      ) : null}
      {text ? (
        <>
          <button type="button" onClick={() => { onFind(-1); }} aria-label="Previous match" className={cn(ICON_BUTTON, "size-7 [&_svg]:size-4")}>
            <ChevronUp aria-hidden />
          </button>
          <button type="button" onClick={() => { onFind(1); }} aria-label="Next match" className={cn(ICON_BUTTON, "size-7 [&_svg]:size-4")}>
            <ChevronDown aria-hidden />
          </button>
          <button type="button" onClick={onClear} aria-label="Clear search" className={cn(ICON_BUTTON, "size-7 [&_svg]:size-4")}>
            <X aria-hidden />
          </button>
        </>
      ) : null}
    </form>
  );
}

// ── Book ─────────────────────────────────────────────────────────────────

// Spread or one page on a wide screen (user 2026-11-06: small print reads
// better one page at a time). This device's choice for every book, PDF or text.
export type BookPages = "spread" | "single";
export const bookPagesPref = createDevicePref<BookPages>(
  "wanheda-reader-book-pages",
  (raw) => (raw === "single" ? "single" : "spread"),
  (v) => v,
);

const MODES: readonly { value: ReadingMode; label: string; icon: typeof BookOpen }[] = [
  { value: "flip", label: "Book", icon: BookOpen },
  { value: "scroll", label: "Scroll", icon: ScrollText },
];

export function ModeSwitch({ mode, onMode }: { mode: ReadingMode; onMode: (m: ReadingMode) => void }) {
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

/** Spread or one page (wide screens only: a narrow one always shows one page). */
export function BookPagesToggle({ value, onChange }: { value: BookPages; onChange: (v: BookPages) => void }) {
  return (
    <Tip
      label={value === "spread" ? "One page at a time" : "Two-page spread"}
      aria-label={value === "spread" ? "Show one page at a time" : "Show a two-page spread"}
      onClick={() => {
        onChange(value === "spread" ? "single" : "spread");
      }}
      className={ICON_BUTTON}
    >
      {value === "spread" ? <RectangleVertical aria-hidden /> : <Columns2 aria-hidden />}
    </Tip>
  );
}

/** `a-b / N`: shows the open pages; type a page and press Enter to go there. */
export function PageField({ field, pages, onPage }: { field: string; pages: number; onPage: (page: number) => void }) {
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
