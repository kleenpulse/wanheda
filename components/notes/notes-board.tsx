"use client";

import * as React from "react";
import { Maximize, Minus, Pin, PinOff, Plus } from "lucide-react";
import { useNotesApi } from "@/components/notes/notes-provider";
import { COLOR_LABEL, NoteColorMenu, STICKY_FILL, STICKY_MARK, STICKY_RING, StickyProgress } from "@/components/notes/sticky";
import { buttonClass } from "@/components/ui/button";
import { useAnimationLoop } from "@/hooks/use-animation-loop";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import {
  GRID,
  clampScale,
  fitCamera,
  layoutBoard,
  nudgePlace,
  parseCamera,
  placeAtCenter,
  settlePlace,
  showsAny,
  type Camera,
  type Sticky,
  type StickyKey,
} from "@/lib/notes/board";
import { STICKY_MAX, STICKY_MIN, checklistProgress, displayTitle, excerpt, type BoardPlace, type Note } from "@/lib/notes/notes";
import { cn } from "@/lib/utils";
import { Tip } from "@/components/ui/tooltip";

/*
  The notes board (FR-NOTES-2), ported from Shadow Garden's infinite-canvas.
  One mutable camera, written by gestures and an animation loop straight to
  the DOM: React never renders a camera frame. A sticky being dragged or
  resized is moved the same way; on release its place is snapped to the grid
  and saved through the notes runtime (api.update → outbox), so a move made
  offline lands later like any other edit. Keyboard: the board pans and zooms;
  a focused sticky moves (arrows) and resizes (Shift + arrows), and those
  saves wait for a pause, so a run of key presses is one write.

  The camera is per device (localStorage): a view on a big screen means
  nothing on a phone.
*/

const CAMERA_KEY = "wanheda-notes-board-camera";
const PAN_STEP = 48;
const DRAG_SLOP = 4;
// Ghost buttons sit on any sticky fill, so their hover is a tint of the ink rather than a fixed surface.
const STICKY_BUTTON =
  "size-8 hover:bg-foreground/8 hover:text-foreground dark:hover:bg-foreground/12 data-popup-open:bg-foreground/8 data-popup-open:text-foreground dark:data-popup-open:bg-foreground/12";
const KEYS: Record<string, StickyKey> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };

export interface NotesBoardHandle {
  /** Where a new sticky goes: the middle of the current view. */
  centerPlace: () => BoardPlace;
}

/** A sticky under the pointer: where it started, and whether it has moved past the slop yet. */
interface Held {
  id: string;
  el: HTMLElement;
  start: BoardPlace;
  px: number;
  py: number;
  moved: boolean;
}

type Gesture =
  | { kind: "pan"; lastX: number; lastY: number; lastT: number }
  | ({ kind: "drag" } & Held)
  | ({ kind: "resize" } & Held)
  | { kind: "pinch"; dist: number };

function readCamera(): Camera | null {
  try {
    const raw = localStorage.getItem(CAMERA_KEY);
    return raw ? parseCamera(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function setPlace(el: HTMLElement, p: BoardPlace) {
  el.style.left = `${String(p.x)}px`;
  el.style.top = `${String(p.y)}px`;
  el.style.width = `${String(p.w)}px`;
  el.style.height = `${String(p.h)}px`;
}

export function NotesBoard({
  notes,
  selectedId,
  loading = false,
  onOpen,
  ref,
}: {
  notes: readonly Note[];
  selectedId: string | null;
  loading?: boolean;
  onOpen: (id: string) => void;
  ref?: React.Ref<NotesBoardHandle>;
}) {
  const api = useNotesApi();
  const reduced = useReducedMotion();
  const stickies = React.useMemo(() => layoutBoard(notes), [notes]);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const worldRef = React.useRef<HTMLDivElement>(null);
  const hintId = React.useId();
  const [zoomLabel, setZoomLabel] = React.useState(100);
  const [raised, setRaised] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  // Everything the listeners read, so they bind once.
  const live = React.useRef({ stickies, onOpen, reduced, api });
  // Key presses faster than a render each build on the last one, not on the stale place.
  const nudged = React.useRef(new Map<string, BoardPlace>());
  React.useLayoutEffect(() => {
    live.current = { stickies, onOpen, reduced, api };
    // Rendered: the places on screen now include every nudge so far.
    nudged.current.clear();
  });

  const cam = React.useRef({ x: GRID, y: GRID, scale: 1, vx: 0, vy: 0, zoomTarget: 1, anchorX: 0, anchorY: 0 });
  const applyRef = React.useRef<(() => void) | null>(null);
  const resizeRef = React.useRef<(() => void) | null>(null);
  const frameRef = React.useRef<((dt: number) => false | undefined) | null>(null);

  const loop = useAnimationLoop({
    target: containerRef,
    halted: false,
    onResize: () => resizeRef.current?.(),
    onFrame: ({ dt }) => (frameRef.current ? frameRef.current(dt) : false),
  });

  const view = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    return { w: rect?.width ?? 0, h: rect?.height ?? 0 };
  };

  const setCamera = React.useCallback(
    (next: Camera) => {
      const c = cam.current;
      Object.assign(c, next, { vx: 0, vy: 0, zoomTarget: next.scale });
      applyRef.current?.();
      loop.start();
    },
    [loop],
  );

  const fit = React.useCallback(() => {
    setCamera(fitCamera(live.current.stickies.map((s) => s.place), view()));
  }, [setCamera]);

  const zoomBy = React.useCallback(
    (factor: number) => {
      const c = cam.current;
      const v = view();
      c.anchorX = v.w / 2;
      c.anchorY = v.h / 2;
      c.zoomTarget = clampScale(c.zoomTarget * factor);
      loop.start();
    },
    [loop],
  );

  React.useImperativeHandle(ref, () => ({ centerPlace: () => placeAtCenter(cam.current, view()) }), []);

  React.useLayoutEffect(() => {
    const container = containerRef.current;
    const world = worldRef.current;
    if (!container || !world) return;
    const c = cam.current;

    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    const saveCamera = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        try {
          localStorage.setItem(CAMERA_KEY, JSON.stringify({ x: Math.round(c.x), y: Math.round(c.y), scale: c.scale }));
        } catch {
          /* storage full or blocked: the view just isn't remembered */
        }
      }, 400);
    };

    let shownZoom = 0;
    const apply = () => {
      world.style.transform = `translate(${String(c.x)}px, ${String(c.y)}px) scale(${String(c.scale)})`;
      const cell = GRID * c.scale;
      container.style.backgroundSize = `${String(cell)}px ${String(cell)}px`;
      container.style.backgroundPosition = `${String(c.x)}px ${String(c.y)}px`;
      const pct = Math.round(c.scale * 100);
      if (pct !== shownZoom) {
        shownZoom = pct;
        setZoomLabel(pct);
      }
    };
    applyRef.current = apply;

    // The view saved on this device, unless it shows no sticky at all (a
    // smaller screen than it was saved on): then every note. A board mounted
    // hidden (a deep link to a note on a phone) has no size yet, so the
    // choice waits for its first real one.
    let startPending = true;
    const chooseStart = () => {
      const v = view();
      if (v.w <= 0 || v.h <= 0) return;
      startPending = false;
      const places = live.current.stickies.map((s) => s.place);
      const stored = readCamera();
      const start = stored && (!places.length || showsAny(stored, places, v)) ? stored : fitCamera(places, v);
      Object.assign(c, start, { zoomTarget: start.scale });
    };
    chooseStart();
    apply();
    resizeRef.current = () => {
      if (startPending) chooseStart();
      apply();
    };

    let gesture: Gesture | null = null;

    const frame = (dt: number) => {
      const still = live.current.reduced;
      if (!gesture && (c.vx !== 0 || c.vy !== 0)) {
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        const decay = still ? 0 : Math.exp(Math.log(0.92) * dt * 60);
        c.vx *= decay;
        c.vy *= decay;
        if (Math.abs(c.vx) < 0.5) c.vx = 0;
        if (Math.abs(c.vy) < 0.5) c.vy = 0;
      }
      // Zoom to a point: the board point under the anchor stays put while easing.
      if (Math.abs(c.zoomTarget - c.scale) > 0.0005) {
        const next = still ? c.zoomTarget : c.scale + (c.zoomTarget - c.scale) * Math.min(1, dt * 12);
        const ratio = next / c.scale;
        c.x = c.anchorX - (c.anchorX - c.x) * ratio;
        c.y = c.anchorY - (c.anchorY - c.y) * ratio;
        c.scale = next;
      } else if (c.scale !== c.zoomTarget) {
        const ratio = c.zoomTarget / c.scale;
        c.x = c.anchorX - (c.anchorX - c.x) * ratio;
        c.y = c.anchorY - (c.anchorY - c.y) * ratio;
        c.scale = c.zoomTarget;
      }
      apply();
      const settled = !gesture && c.vx === 0 && c.vy === 0 && c.scale === c.zoomTarget;
      if (settled) {
        world.style.willChange = "";
        // A board still waiting for its size must not overwrite the saved view with the default.
        if (!startPending) saveCamera();
        return false;
      }
      world.style.willChange = "transform";
    };
    frameRef.current = frame;

    // ---- gestures ------------------------------------------------------------
    const pointers = new Map<number, { x: number; y: number }>();

    const stickyAt = (id: string): Sticky | undefined => live.current.stickies.find((s) => s.note.id === id);

    const commit = (id: string, place: BoardPlace, immediate: boolean) => {
      live.current.api.update(id, { board: place }, { immediate });
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const target = e.target as HTMLElement;
      // Buttons and menus on a sticky handle their own clicks.
      if (target.closest("[data-no-drag]")) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try {
        container.setPointerCapture(e.pointerId);
      } catch {
        /* not an active pointer (a synthetic event): no capture, the gesture still works */
      }

      if (pointers.size === 2) {
        // A second finger mid-drag turns it into a pinch: the sticky goes back where it was.
        if (gesture?.kind === "drag" || gesture?.kind === "resize") {
          setPlace(gesture.el, gesture.start);
          delete gesture.el.dataset.dragging;
        }
        const [p1, p2] = [...pointers.values()];
        if (p1 && p2) gesture = { kind: "pinch", dist: Math.hypot(p2.x - p1.x, p2.y - p1.y) };
        return;
      }

      const el = target.closest<HTMLElement>("[data-sticky]");
      const sticky = el ? stickyAt(el.dataset.sticky ?? "") : undefined;
      if (el && sticky) {
        setRaised(sticky.note.id);
        const base = { id: sticky.note.id, el, start: sticky.place, px: e.clientX, py: e.clientY };
        const held: Held = { ...base, moved: false };
        gesture = target.closest("[data-resize]") ? { kind: "resize", ...held } : { kind: "drag", ...held };
        return;
      }

      gesture = { kind: "pan", lastX: e.clientX, lastY: e.clientY, lastT: performance.now() };
      c.vx = 0;
      c.vy = 0;
      loop.start();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = gesture;
      if (!g) return;

      if (g.kind === "pinch") {
        const [p1, p2] = [...pointers.values()];
        if (!p1 || !p2) return;
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const rect = container.getBoundingClientRect();
        c.anchorX = (p1.x + p2.x) / 2 - rect.left;
        c.anchorY = (p1.y + p2.y) / 2 - rect.top;
        if (g.dist > 0) c.zoomTarget = clampScale(c.zoomTarget * (dist / g.dist));
        g.dist = dist;
        loop.start();
        return;
      }

      if (g.kind === "drag" || g.kind === "resize") {
        const dx = (e.clientX - g.px) / c.scale;
        const dy = (e.clientY - g.py) / c.scale;
        if (!g.moved && Math.hypot(e.clientX - g.px, e.clientY - g.py) < DRAG_SLOP) return;
        g.moved = true;
        if (g.kind === "drag") {
          g.el.dataset.dragging = "";
          setPlace(g.el, { ...g.start, x: g.start.x + dx, y: g.start.y + dy });
        } else {
          setPlace(g.el, {
            ...g.start,
            w: Math.min(STICKY_MAX.w, Math.max(STICKY_MIN.w, g.start.w + dx)),
            h: Math.min(STICKY_MAX.h, Math.max(STICKY_MIN.h, g.start.h + dy)),
          });
        }
        return;
      }

      const now = performance.now();
      const dx = e.clientX - g.lastX;
      const dy = e.clientY - g.lastY;
      const dtms = Math.max(now - g.lastT, 1);
      c.x += dx;
      c.y += dy;
      c.vx = (dx / dtms) * 1000;
      c.vy = (dy / dtms) * 1000;
      g.lastX = e.clientX;
      g.lastY = e.clientY;
      g.lastT = now;
      apply();
    };

    const onPointerUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      try {
        container.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      const g = gesture;
      if (!g) return;
      if (g.kind === "pinch") {
        if (pointers.size < 2) gesture = null;
        return;
      }
      gesture = null;
      const cancelled = e.type === "pointercancel";

      if (g.kind === "drag") {
        delete g.el.dataset.dragging;
        if (!g.moved) {
          if (!cancelled) live.current.onOpen(g.id);
          return;
        }
        const dx = (e.clientX - g.px) / c.scale;
        const dy = (e.clientY - g.py) / c.scale;
        const place = cancelled ? g.start : settlePlace({ ...g.start, x: g.start.x + dx, y: g.start.y + dy });
        setPlace(g.el, place);
        if (!cancelled) commit(g.id, place, true);
        return;
      }
      if (g.kind === "resize") {
        // A click on the corner moved nothing: nothing to save (an unplaced sticky stays unplaced).
        if (!g.moved) return;
        const place = cancelled
          ? g.start
          : settlePlace({ ...g.start, w: g.start.w + (e.clientX - g.px) / c.scale, h: g.start.h + (e.clientY - g.py) / c.scale });
        setPlace(g.el, place);
        if (!cancelled) commit(g.id, place, true);
        return;
      }
      // A release after a pause is a stop, not a throw.
      if (performance.now() - g.lastT > 90) {
        c.vx = 0;
        c.vy = 0;
      }
      loop.start();
    };

    // Native listener: React's onWheel is passive, so preventDefault would
    // fail and the page would scroll. Wheel pans; Ctrl/⌘ + wheel (and a
    // trackpad pinch) zooms to the pointer.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const rect = container.getBoundingClientRect();
        c.anchorX = e.clientX - rect.left;
        c.anchorY = e.clientY - rect.top;
        c.zoomTarget = clampScale(c.zoomTarget * Math.exp(-e.deltaY * 0.0025));
      } else {
        c.x -= e.deltaX;
        c.y -= e.deltaY;
        apply();
      }
      loop.start();
    };

    let nudgeTimer: ReturnType<typeof setTimeout> | undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement;
      const key = KEYS[e.key];

      // A focused sticky: move, resize, open, or step back to the board.
      if (target.dataset.sticky !== undefined) {
        const sticky = stickyAt(target.dataset.sticky);
        if (!sticky) return;
        if (key) {
          e.preventDefault();
          const place = nudgePlace(nudged.current.get(sticky.note.id) ?? sticky.place, key, e.shiftKey);
          nudged.current.set(sticky.note.id, place);
          setPlace(target, place);
          setRaised(sticky.note.id);
          // Waits for a pause in key presses: one write for a run of them.
          commit(sticky.note.id, place, false);
          clearTimeout(nudgeTimer);
          nudgeTimer = setTimeout(() => {
            setAnnouncement(
              e.shiftKey ? `Resized to ${String(place.w)} by ${String(place.h)}.` : `Moved to ${String(place.x)}, ${String(place.y)}.`,
            );
          }, 500);
        } else if (e.key === "Enter") {
          e.preventDefault();
          live.current.onOpen(sticky.note.id);
        } else if (e.key === "Escape") {
          e.preventDefault();
          container.focus();
        }
        return;
      }
      if (target !== container) return;

      if (key) {
        e.preventDefault();
        if (key === "left") c.x += PAN_STEP;
        else if (key === "right") c.x -= PAN_STEP;
        else if (key === "up") c.y += PAN_STEP;
        else c.y -= PAN_STEP;
        apply();
        loop.start();
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomBy(1.2);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        zoomBy(1 / 1.2);
      } else if (e.key === "0") {
        e.preventDefault();
        fit();
      }
    };

    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", onPointerUp);
    container.addEventListener("pointercancel", onPointerUp);
    container.addEventListener("wheel", onWheel, { passive: false });
    container.addEventListener("keydown", onKeyDown);

    return () => {
      clearTimeout(saveTimer);
      clearTimeout(nudgeTimer);
      frameRef.current = null;
      applyRef.current = null;
      resizeRef.current = null;
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("pointercancel", onPointerUp);
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("keydown", onKeyDown);
      world.style.willChange = "";
    };
  }, [loop, fit, zoomBy]);

  return (
    <div className="relative h-full min-h-0">
      <div
        ref={containerRef}
        tabIndex={0}
        role="region"
        aria-label="Notes board"
        aria-describedby={hintId}
        // touch-none: a finger drag pans the board instead of the page.
        className="relative h-full w-full cursor-grab touch-none overflow-hidden rounded-card bg-card ring-1 ring-border outline-none select-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing dark:ring-glass-border"
        style={{ backgroundImage: "radial-gradient(color-mix(in oklab, var(--foreground) 16%, transparent) 1px, transparent 1px)" }}
      >
        <div ref={worldRef} className="absolute top-0 left-0 origin-top-left">
          {stickies.map((s) => (
            <StickyNote
              key={s.note.id}
              sticky={s}
              selected={s.note.id === selectedId}
              z={s.note.id === raised ? 3 : s.note.id === selectedId ? 2 : 1}
              hintId={hintId}
            />
          ))}
        </div>
        {stickies.length === 0 ? (
          <p className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center text-[13.5px] text-ink-2">
            {loading ? "Loading notes…" : "No notes on the board yet. Press New note to put one here."}
          </p>
        ) : null}
      </div>

      <div className="glass absolute top-3 left-3 flex items-center gap-0.5 rounded-pill p-1 shadow-lift">
        <Tip type="button" onClick={() => { zoomBy(1 / 1.2); }} className={buttonClass("ghost", "circle-sm", "size-8")} label="Zoom out (−)">
          <Minus aria-hidden />
          <span className="sr-only">Zoom out</span>
        </Tip>
        <span className="readout w-11 text-center tabular" aria-live="polite">
          {zoomLabel}%
        </span>
        <Tip type="button" onClick={() => { zoomBy(1.2); }} className={buttonClass("ghost", "circle-sm", "size-8")} label="Zoom in (+)">
          <Plus aria-hidden />
          <span className="sr-only">Zoom in</span>
        </Tip>
        <Tip type="button" onClick={fit} className={buttonClass("ghost", "circle-sm", "size-8")} label="Show every note (0)">
          <Maximize aria-hidden />
          <span className="sr-only">Show every note</span>
        </Tip>
      </div>

      <p id={hintId} className="sr-only">
        On the board: arrow keys pan, plus and minus zoom, 0 shows every note. On a note: arrow keys move it, Shift and arrow keys
        resize it, Enter opens it, Escape goes back to the board.
      </p>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

const StickyNote = React.memo(function StickyNote({
  sticky,
  selected,
  z,
  hintId,
}: {
  sticky: Sticky;
  selected: boolean;
  z: number;
  hintId: string;
}) {
  const api = useNotesApi();
  const { note, place } = sticky;
  const title = displayTitle(note);
  const progress = checklistProgress(note.bodyMd);
  const text = excerpt(note, 600);
  const label = [title, note.pinned ? "pinned" : null, progress ? `${String(progress.done)} of ${String(progress.total)} done` : null, `${COLOR_LABEL[note.color]} note`]
    .filter(Boolean)
    .join(", ");

  return (
    <article
      data-sticky={note.id}
      tabIndex={0}
      aria-label={label}
      aria-describedby={hintId}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "group absolute flex cursor-grab flex-col overflow-hidden rounded-[18px] text-foreground shadow-lift ring-1 ring-border outline-none dark:ring-glass-border",
        "focus-visible:ring-2 focus-visible:ring-ring data-dragging:cursor-grabbing data-dragging:opacity-95",
        STICKY_FILL[note.color],
        selected && cn("ring-2", STICKY_RING[note.color]),
      )}
      style={{ left: place.x, top: place.y, width: place.w, height: place.h, zIndex: z }}
    >
      <span aria-hidden className={cn("h-1.5 shrink-0", STICKY_MARK[note.color], note.color === "plain" && "opacity-20")} />
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 pt-2 pr-1.5 pb-3 pl-3.5">
        <div className="flex items-start gap-1">
          <h3 className="min-w-0 flex-1 truncate pt-1.5 text-[14px] leading-snug font-medium">{title}</h3>
          {/* The controls stay laid out and only fade: hiding them with display:none made the header grow on hover (text jumped)
              and pulled the colour menu's anchor away, so the menu flew to the corner while it was open or closing. */}
          <span className="relative flex shrink-0 items-center">
            {note.pinned ? (
              <Pin
                aria-hidden
                className={cn(
                  "pointer-events-none absolute top-2.5 right-2.5 size-3.5 text-ink-2 transition-opacity duration-150",
                  "group-focus-within:opacity-0 group-hover:opacity-0 group-has-data-popup-open:opacity-0 pointer-coarse:opacity-0",
                )}
                strokeWidth={1.75}
              />
            ) : null}
            <span
              className={cn(
                "flex items-center opacity-0 transition-opacity duration-150",
                "group-focus-within:opacity-100 group-hover:opacity-100 has-data-popup-open:opacity-100 pointer-coarse:opacity-100",
              )}
            >
              <NoteColorMenu
                color={note.color}
                className={STICKY_BUTTON}
                onPick={(color) => {
                  api.update(note.id, { color });
                }}
              />
              <Tip
                type="button"
                data-no-drag
                aria-pressed={note.pinned}
                onClick={() => {
                  api.update(note.id, { pinned: !note.pinned });
                }}
                className={buttonClass("ghost", "circle-sm", STICKY_BUTTON)}
                label={note.pinned ? "Unpin" : "Pin"}
              >
                {note.pinned ? <PinOff aria-hidden strokeWidth={1.75} /> : <Pin aria-hidden strokeWidth={1.75} />}
                <span className="sr-only">{note.pinned ? "Unpin" : "Pin"}</span>
              </Tip>
            </span>
          </span>
        </div>
        {text ? (
          <p className="min-h-0 flex-1 overflow-hidden pr-2 text-[13px] leading-snug wrap-break-word text-ink-2 mask-b-from-70%">{text}</p>
        ) : (
          <span className="flex-1" />
        )}
        {progress ? (
          <span className="pr-2">
            <StickyProgress done={progress.done} total={progress.total} color={note.color} />
          </span>
        ) : null}
      </div>
      <span data-resize aria-hidden className="absolute right-0 bottom-0 flex size-6 cursor-nwse-resize items-end justify-end p-1.5">
        <span className="size-2 border-r-2 border-b-2 border-foreground/25 rounded-br-[3px]" />
      </span>
    </article>
  );
});
