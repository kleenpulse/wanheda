"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

// The dynamic island, ported from Shadow Garden's LiveActivity
// (components/registry/live-activity). One black shape hosts a rotating set of
// live activities; each supplies the compact pill's two slots and the expanded
// card, and the island morphs between them: content leaves fast, the shell
// springs to its new size, and the incoming content arrives once the shape has
// all but landed.
//
// Changes from the registry: activities own their state (the activity bus),
// so the island only provides a tick; the tick is a plain rAF loop, which the
// browser already stops in hidden tabs (FR-ISLAND-6); colours are tokens.

export interface IslandActivity {
  id: string;
  /** The activity's name, e.g. "25 min timer". Names the expanded card. */
  label: string;
  /** Read out on the compact pill after the name; live, so it can say "done". */
  status?: ReactNode;
  /** Left of the cutout in the compact pill: a glyph, artwork or ring. */
  leading: ReactNode;
  /** Right of the cutout: the one number worth glancing at. */
  trailing: ReactNode;
  /** The card the pill opens into. Brings its own padding. */
  expanded: ReactNode;
}

interface IslandContextValue {
  /** Wall clock, refreshed at TICK_HZ while the tab is visible. */
  now: number;
  expanded: boolean;
  reduced: boolean;
  collapse: () => void;
}

const IslandContext = createContext<IslandContextValue | null>(null);

/** Clock and mode for views rendered inside the island. */
export function useIsland(): IslandContextValue {
  const ctx = useContext(IslandContext);
  if (!ctx) throw new Error("Island views must render inside <LiveActivity>");
  return ctx;
}

// Ten commits a second is plenty for clocks and rings.
const TICK_HZ = 10;

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      if (t - last >= 1000 / TICK_HZ) {
        last = t;
        setNow(Date.now());
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, []);
  return now;
}

export function LiveActivity({
  activities,
  show,
  cycleInterval = 6,
  stiffness = 420,
  damping = 25,
  contentBlur = 6,
  className,
}: {
  activities: IslandActivity[];
  /** Id to bring forward when it changes, e.g. a timer that just started. */
  show?: string | undefined;
  /** Seconds each activity holds the island before the next takes over. */
  cycleInterval?: number;
  stiffness?: number;
  damping?: number;
  /** Blur, in px, that content dissolves through on its way in and out. */
  contentBlur?: number;
  className?: string;
}) {
  const reduce = Boolean(useReducedMotion());
  const now = useNow();

  const rootRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const [picked, setPicked] = useState(show ?? activities[0]?.id);
  const [lastShow, setLastShow] = useState(show);
  if (show !== lastShow) {
    setLastShow(show);
    if (show) setPicked(show);
  }
  const index = Math.max(
    0,
    activities.findIndex((a) => a.id === picked),
  );
  const current = activities[index];

  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const refocusPill = useRef(false);

  const step = useCallback(
    (dir: 1 | -1) => {
      const n = activities.length;
      if (n < 2) return;
      setPicked(activities[(index + dir + n) % n]?.id);
    },
    [activities, index],
  );

  // A swap remounts the pill under a new key. If the outgoing one held focus,
  // hand it on now, or focus falls to the body and the arrows stop working.
  const lastSwitch = useRef(now);
  useEffect(() => {
    lastSwitch.current = Date.now();
    if (!expanded && rootRef.current?.contains(document.activeElement)) {
      pillRef.current?.focus({ preventScroll: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on activity change only
  }, [current?.id]);

  // The cycle stands still while anyone is looking at, pointing at or tabbed into it.
  const held = expanded || hovered || focused;
  useEffect(() => {
    if (held || activities.length < 2) {
      lastSwitch.current = now;
      return;
    }
    if (now - lastSwitch.current < cycleInterval * 1000) return;
    lastSwitch.current = now;
    step(1);
  }, [now, held, activities.length, cycleInterval, step]);

  const collapse = useCallback((returnFocus: boolean) => {
    refocusPill.current = returnFocus;
    setExpanded(false);
  }, []);

  // An activity that ends while its card is open closes the card.
  if (expanded && !current) setExpanded(false);

  useEffect(() => {
    if (expanded) {
      cardRef.current?.focus({ preventScroll: true });
      return;
    }
    if (refocusPill.current) {
      refocusPill.current = false;
      pillRef.current?.focus({ preventScroll: true });
    }
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) collapse(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("pointerdown", onDown);
    };
  }, [expanded, collapse]);

  const onRootKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && expanded) {
      e.preventDefault();
      collapse(true);
    }
  };

  const onPillKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      step(e.key === "ArrowRight" ? 1 : -1);
    }
  };

  const ctx = useMemo<IslandContextValue>(
    () => ({
      now,
      expanded,
      reduced: reduce,
      collapse: () => {
        collapse(true);
      },
    }),
    [now, expanded, reduce, collapse],
  );

  if (!current) return null;

  const spring = reduce ? { duration: 0 } : { type: "spring" as const, stiffness, damping };
  const blur = reduce ? 0 : contentBlur;
  const gone = { opacity: 0, scale: reduce ? 1 : 0.92, ...(blur > 0 ? { filter: `blur(${blur}px)` } : {}) };
  const shown = {
    opacity: 1,
    scale: 1,
    ...(blur > 0 ? { filter: "blur(0px)" } : {}),
    transition: reduce ? { duration: 0 } : { duration: 0.3, delay: 0.12, ease: EASE_OUT },
  };
  const leaving = { ...gone, transition: reduce ? { duration: 0 } : { duration: 0.12 } };

  return (
    <IslandContext.Provider value={ctx}>
      <MotionConfig transition={spring}>
        <div
          ref={rootRef}
          className={cn("flex w-full justify-center", className)}
          style={{ containerType: "inline-size" }}
          onKeyDown={onRootKeyDown}
          onPointerEnter={(e) => {
            if (e.pointerType === "mouse") setHovered(true);
          }}
          onPointerLeave={() => {
            setHovered(false);
          }}
          onFocus={() => {
            setFocused(true);
          }}
          onBlur={(e) => {
            if (rootRef.current?.contains(e.relatedTarget)) return;
            setFocused(false);
            if (expanded) collapse(false);
          }}
        >
          {/* Radius sits in `style` so motion corrects it through the layout
              scale; as a class it would stretch into an ellipse mid-morph. */}
          <motion.div
            layout
            {...(expanded || reduce ? {} : { whileTap: { scale: 0.96 } })}
            className={cn(
              "pointer-events-auto relative overflow-hidden bg-island text-island-foreground outline-offset-2",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-signal",
              expanded ? "shadow-lift" : "shadow-card",
            )}
            style={{ borderRadius: expanded ? 32 : 20 }}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {expanded ? (
                <motion.div
                  key={`${current.id}:card`}
                  ref={cardRef}
                  role="group"
                  aria-label={current.label}
                  tabIndex={-1}
                  layout="position"
                  initial={gone}
                  animate={shown}
                  exit={leaving}
                  className="w-[min(22.5rem,calc(100cqw-1rem))] outline-none"
                >
                  {current.expanded}
                </motion.div>
              ) : (
                <motion.button
                  key={`${current.id}:pill`}
                  ref={pillRef}
                  type="button"
                  aria-expanded={false}
                  onClick={() => {
                    setExpanded(true);
                  }}
                  onKeyDown={onPillKeyDown}
                  layout="position"
                  initial={gone}
                  animate={shown}
                  exit={leaving}
                  className="flex h-9 items-center gap-2 pr-3 pl-1.5 outline-none"
                >
                  <span className="sr-only">
                    {current.label}
                    {current.status}
                    {activities.length > 1 ? `, ${index + 1} of ${activities.length}. Arrow keys switch.` : ""}
                  </span>
                  <span aria-hidden className="flex min-w-6 items-center">
                    {current.leading}
                  </span>
                  {/* The cutout: hardware sits here, so content never does. */}
                  <span aria-hidden className="w-14 shrink-0" />
                  <motion.span layout="position" aria-hidden className="flex min-w-6 items-center justify-end">
                    {current.trailing}
                  </motion.span>
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </MotionConfig>
    </IslandContext.Provider>
  );
}
