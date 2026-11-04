"use client";

import * as React from "react";
import { animate, motion, useMotionValue, type MotionValue } from "motion/react";
import { GripHorizontal, X } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import type { WindowDef } from "@/lib/modules";
import { SNAP_SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";
import {
  MARGIN,
  clampSize,
  nudgeWindow,
  resolveRect,
  settle,
  type Bounds,
  type Direction,
  type Placement,
  type Rect,
} from "@/lib/windows/geometry";

const KEYS: Partial<Record<string, Direction>> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

interface Drag {
  mode: "move" | "resize";
  pointerX: number;
  pointerY: number;
  start: Rect;
}

/**
 * One floating panel (FR-SHELL-5). Position and size are motion values, so a
 * drag moves the frame without re-rendering what is inside it. On release it
 * settles (snaps to a near edge), springs there and stores the placement.
 * The grip is the keyboard path: arrows move, Shift with arrows resizes.
 */
export function MiniWindow({
  def,
  placement,
  bounds,
  z,
  onPlace,
  onRaise,
  onClose,
  announce,
  children,
}: {
  def: WindowDef;
  placement: Placement;
  bounds: Bounds;
  z: number;
  onPlace: (p: Placement) => void;
  onRaise: () => void;
  onClose: () => void;
  announce: (message: string) => void;
  children: React.ReactNode;
}) {
  const rect = resolveRect(placement, def.size, bounds);
  const x = useMotionValue(rect.x);
  const y = useMotionValue(rect.y);
  const w = useMotionValue(rect.w);
  const h = useMotionValue(rect.h);
  const drag = React.useRef<Drag | null>(null);
  const reduced = useReducedMotion();
  const Icon = def.icon;

  // Follow the store and the layer size. A value still springing to where a
  // drop just put it is left alone: the store now agrees with its target.
  React.useEffect(() => {
    if (drag.current) return;
    const pairs: [MotionValue<number>, number][] = [
      [x, rect.x],
      [y, rect.y],
      [w, rect.w],
      [h, rect.h],
    ];
    for (const [mv, v] of pairs) if (!mv.isAnimating()) mv.set(v);
  }, [x, y, w, h, rect.x, rect.y, rect.w, rect.h]);

  const moveTo = (target: Rect) => {
    const pairs: [MotionValue<number>, number][] = [
      [x, target.x],
      [y, target.y],
      [w, target.w],
      [h, target.h],
    ];
    for (const [mv, v] of pairs) {
      if (reduced) mv.set(v);
      else void animate(mv, v, SNAP_SPRING);
    }
  };

  // One set of handlers for the title bar and the corner; `data-drag` says which.
  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("[data-no-drag]")) return;
    const mode: Drag["mode"] = e.currentTarget.dataset.drag === "resize" ? "resize" : "move";
    e.currentTarget.setPointerCapture(e.pointerId);
    for (const mv of [x, y, w, h]) mv.stop();
    drag.current = { mode, pointerX: e.clientX, pointerY: e.clientY, start: { x: x.get(), y: y.get(), w: w.get(), h: h.get() } };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.pointerX;
    const dy = e.clientY - d.pointerY;
    if (d.mode === "move") {
      // Free while held, kept inside the layer; the margin and snap come on release.
      x.set(Math.min(Math.max(d.start.x + dx, 0), Math.max(0, bounds.w - d.start.w)));
      y.set(Math.min(Math.max(d.start.y + dy, 0), Math.max(0, bounds.h - d.start.h)));
    } else {
      const room = { w: bounds.w - d.start.x + MARGIN, h: bounds.h - d.start.y + MARGIN };
      const size = clampSize(d.start.w + dx, d.start.h + dy, def.size, room);
      w.set(size.w);
      h.set(size.h);
    }
  };

  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    const settled = settle({ x: x.get(), y: y.get(), w: w.get(), h: h.get() }, def.size, bounds);
    moveTo(resolveRect(settled, def.size, bounds));
    onPlace(settled);
  };

  const onPointerCancel = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    moveTo(d.start);
  };

  const dragProps = { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };

  const onGripKey = (e: React.KeyboardEvent) => {
    const dir = KEYS[e.key];
    if (!dir) return;
    e.preventDefault();
    const mode = e.shiftKey ? "resize" : "move";
    const next = nudgeWindow(placement, def.size, bounds, dir, mode);
    if (!next) {
      announce(mode === "move" ? `${def.title} can't move ${dir}.` : `${def.title} is at its size limit.`);
      return;
    }
    const at = resolveRect(next, def.size, bounds);
    moveTo(at);
    onPlace(next);
    announce(
      mode === "move"
        ? `${def.title} moved ${dir}${edgeNote(next)}.`
        : `${def.title}: ${String(at.w)} by ${String(at.h)} pixels.`,
    );
  };

  return (
    <motion.section
      data-window={def.id}
      aria-label={def.title}
      tabIndex={-1}
      style={{ x, y, width: w, height: h, zIndex: z }}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12 } }}
      transition={SNAP_SPRING}
      onPointerDownCapture={onRaise}
      onFocusCapture={onRaise}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented) {
          e.preventDefault();
          onClose();
        }
      }}
      className="glass-window pointer-events-auto absolute top-0 left-0 flex flex-col overflow-hidden rounded-card shadow-lift outline-none"
    >
      <header
        data-drag="move"
        {...dragProps}
        className="flex h-12 shrink-0 cursor-grab touch-none items-center gap-2 border-b border-border pr-2 pl-2 select-none active:cursor-grabbing dark:border-glass-border"
      >
        {/* A button so it takes focus: the keyboard path. A pointer drags from anywhere on the bar. */}
        <button
          type="button"
          aria-label={`Move ${def.title}. Arrow keys move it, Shift with arrow keys resizes it, Escape closes it.`}
          aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Shift+ArrowLeft Shift+ArrowRight Shift+ArrowUp Shift+ArrowDown Escape"
          onKeyDown={onGripKey}
          className={buttonClass("ghost", "circle-sm", "size-8 cursor-grab")}
        >
          <GripHorizontal aria-hidden />
        </button>
        <h2 className="readout flex min-w-0 flex-1 items-center gap-2">
          <Icon aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">{def.title}</span>
        </h2>
        <button
          type="button"
          data-no-drag
          aria-label={`Close ${def.title}`}
          onClick={onClose}
          className={buttonClass("ghost", "circle-sm", "size-8")}
        >
          <X aria-hidden />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      <span
        aria-hidden
        data-drag="resize"
        {...dragProps}
        className={cn(
          "absolute right-0 bottom-0 size-5 cursor-nwse-resize touch-none",
          "after:absolute after:right-1.5 after:bottom-1.5 after:size-2 after:rounded-br-[3px] after:border-r-2 after:border-b-2 after:border-ink-3/60",
        )}
      />
    </motion.section>
  );
}

function edgeNote(p: Placement): string {
  const edges = [p.snapY === "start" ? "top" : p.snapY === "end" ? "bottom" : "", p.snapX === "start" ? "left" : p.snapX === "end" ? "right" : ""];
  const on = edges.filter(Boolean);
  return on.length ? `, snapped to the ${on.join(" ")} edge` : "";
}
