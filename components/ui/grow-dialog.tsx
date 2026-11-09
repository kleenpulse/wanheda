"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotionConfig, type Transition } from "motion/react";
import { X } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/*
  Grow-from-trigger dialog, ported from Shadow Garden's registry
  (D:\Vxrcel\shadow-garden\components\registry\grow-dialog) onto Wanheda's
  tokens. Pass the clicked element's getBoundingClientRect() as `originRect`:
  the panel scales and moves out of that rect to the centre, and shrinks back
  into it on close. The trigger never animates; it is only a coordinate source.
  No originRect, or reduced motion (OS or the app setting via MotionConfig) →
  a plain centred fade.

  Wanheda changes: glass-window panel and house close button; Escape and the
  Tab trap act only while focus is inside the panel, so Escape in a Select or
  Calendar popover (portalled outside it) closes that popover, not the dialog.
  Keep it mounted (`open` prop), never `{open && …}`, or the exit can't play.
*/

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

const SPRING: Transition = { type: "spring", stiffness: 320, damping: 34, mass: 0.8 };

export function GrowDialog({
  open,
  onOpenChange,
  title,
  originRect,
  maxWidth = 440,
  initialFocus,
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** The trigger's getBoundingClientRect: where the panel grows from. */
  originRect?: DOMRect | null;
  /** The panel's max width in px; also sizes the collapsed scale. */
  maxWidth?: number;
  /** A selector inside the panel to focus on open; default the first focusable. */
  initialFocus?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotionConfig() ?? false;
  const panel = React.useRef<HTMLDivElement>(null);
  const opener = React.useRef<HTMLElement | null>(null);
  const titleId = React.useId();
  // Portals need the DOM: false on the server and during hydration, true after.
  const mounted = React.useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  // Parents pass an inline lambda; read it through a ref so the open effect
  // doesn't re-run (and re-focus) on every parent render.
  const change = React.useRef(onOpenChange);
  React.useEffect(() => {
    change.current = onOpenChange;
  });

  React.useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    document.body.classList.add("overflow-hidden");
    const target = (initialFocus && panel.current?.querySelector<HTMLElement>(initialFocus)) || panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus();
    const onKey = (e: KeyboardEvent) => {
      const inside = panel.current?.contains(document.activeElement) ?? false;
      if (!inside) return;
      if (e.key === "Escape") {
        e.preventDefault();
        change.current(false);
        return;
      }
      if (e.key !== "Tab") return;
      const all = panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      const first = all?.[0];
      const last = all?.[all.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("overflow-hidden");
      opener.current?.focus();
    };
  }, [open, initialFocus]);

  // The open panel is centred in the window below the desktop title bar (--tb,
  // 0 on the web), so only the trigger's offset from that centre and a width
  // ratio are needed. The same values drive enter and exit, so the grow and
  // the shrink mirror each other.
  const growFrom = React.useMemo(() => {
    if (!originRect || reduce || typeof window === "undefined") return null;
    const vw = window.innerWidth;
    const tb = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--tb")) || 0;
    const centreY = (window.innerHeight + tb) / 2;
    const width = Math.min(maxWidth, vw - 32);
    return {
      opacity: 0,
      x: originRect.left + originRect.width / 2 - vw / 2,
      y: originRect.top + originRect.height / 2 - centreY,
      scale: Math.min(0.9, Math.max(0.1, originRect.width / width)),
    };
  }, [originRect, reduce, maxWidth]);

  if (!mounted) return null;
  const fade = { opacity: 0, scale: 0.96 };

  return createPortal(
    <AnimatePresence initial={false}>
      {open ? (
        <React.Fragment key="grow-dialog">
          <motion.div
            className="fixed inset-0 z-50 bg-background/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.18 }}
            onClick={() => {
              onOpenChange(false);
            }}
          />
          <div className="pointer-events-none fixed inset-x-0 top-(--tb) bottom-0 z-50 flex items-center justify-center p-4">
            <motion.div
              ref={panel}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              initial={growFrom ?? fade}
              animate={growFrom ? { opacity: 1, x: 0, y: 0, scale: 1 } : { opacity: 1, scale: 1 }}
              exit={growFrom ?? fade}
              transition={reduce ? { duration: 0 } : SPRING}
              style={{ maxWidth }}
              className={cn(
                "glass-window pointer-events-auto flex max-h-[calc(var(--app-h)-2rem)] w-full flex-col overflow-hidden rounded-card shadow-lift outline-none",
                className,
              )}
            >
              {/* The box grows, then its content fades in as it settles. */}
              <motion.div
                className="flex min-h-0 flex-1 flex-col overflow-y-auto scroll-fade overscroll-contain p-5"
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={reduce ? { duration: 0 } : { duration: 0.18, delay: 0.12 }}
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 id={titleId} className="font-display text-[17px] leading-tight text-foreground">
                    {title}
                  </h2>
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={() => {
                      onOpenChange(false);
                    }}
                    className={buttonClass("ghost", "circle-sm", "size-8")}
                  >
                    <X aria-hidden />
                  </button>
                </div>
                {children}
              </motion.div>
            </motion.div>
          </div>
        </React.Fragment>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
