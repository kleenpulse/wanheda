"use client";

import * as React from "react";
import { AnimatePresence } from "motion/react";
import { MiniWindow } from "@/components/windows/mini-window";
import { NoteWindow } from "@/components/windows/note-window";
import { TimerWindow } from "@/components/windows/timer-window";
import { windowDef, type WindowId } from "@/lib/modules";
import { defaultPlacement, type Bounds } from "@/lib/windows/geometry";
import { useWindows } from "@/lib/windows/store";

/** Each window's body, keyed by id, so a manifest window without one fails typecheck. */
const BODIES: Record<WindowId, React.ComponentType> = {
  "timer.window": TimerWindow,
  "notes.note": NoteWindow,
};

function useLayerBounds(ref: React.RefObject<HTMLElement | null>): Bounds | null {
  const [bounds, setBounds] = React.useState<Bounds | null>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setBounds((b) => (b && b.w === width && b.h === height ? b : { w: width, h: height }));
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [ref]);
  return bounds;
}

/** Loads the remembered windows after mount: the server renders none. */
function useWindowsHydrated(): boolean {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    void Promise.resolve(useWindows.persist.rehydrate()).then(() => {
      setReady(true);
    });
  }, []);
  return ready;
}

/**
 * The mini-window layer (FR-SHELL-5): floats over the content column, under
 * the island and the palette, and above the dock's band so a window snapped
 * to the bottom never sits behind it. A window opened by the owner takes
 * focus; windows restored on load do not.
 */
export function WindowLayer() {
  const ref = React.useRef<HTMLDivElement>(null);
  const bounds = useLayerBounds(ref);
  const ready = useWindowsHydrated();
  const open = useWindows((s) => s.open);
  const placements = useWindows((s) => s.placements);
  const { openWindow, closeWindow, place } = useWindows.getState();
  const [announcement, setAnnouncement] = React.useState("");

  const seen = React.useRef<ReadonlySet<WindowId> | null>(null);
  React.useEffect(() => {
    if (!ready || !bounds) return;
    // Pin where a new window first opened, so raising another one later
    // can't change its cascade slot and move it.
    const { placements: stored } = useWindows.getState();
    open.forEach((id, i) => {
      if (!stored[id]) place(id, defaultPlacement(windowDef(id).size, bounds, i));
    });
    const before = seen.current;
    seen.current = new Set(open);
    if (!before) return;
    const top = open.at(-1);
    if (top && !before.has(top)) {
      requestAnimationFrame(() => {
        ref.current?.querySelector<HTMLElement>(`[data-window="${top}"]`)?.focus();
      });
    }
  }, [ready, bounds, open, place]);

  const close = (id: WindowId) => {
    const el = ref.current?.querySelector(`[data-window="${id}"]`);
    const hadFocus = Boolean(el?.contains(document.activeElement));
    closeWindow(id);
    setAnnouncement(`${windowDef(id).title} closed.`);
    // The focused window is gone: land on its dock entry, not <body>.
    if (hadFocus) {
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`[data-dock-window="${id}"]`)?.focus();
      });
    }
  };

  return (
    <div ref={ref} className="pointer-events-none fixed inset-x-0 top-0 bottom-[84px] z-25 md:left-(--rail-w)">
      <AnimatePresence>
        {ready && bounds
          ? open.map((id, i) => {
              const def = windowDef(id);
              const Body = BODIES[id];
              return (
                <MiniWindow
                  key={id}
                  def={def}
                  placement={placements[id] ?? defaultPlacement(def.size, bounds, i)}
                  bounds={bounds}
                  z={i + 1}
                  onPlace={(p) => {
                    place(id, p);
                  }}
                  onRaise={() => {
                    openWindow(id);
                  }}
                  onClose={() => {
                    close(id);
                  }}
                  announce={setAnnouncement}
                >
                  <Body />
                </MiniWindow>
              );
            })
          : null}
      </AnimatePresence>
      <p className="sr-only" aria-live="assertive">
        {announcement}
      </p>
    </div>
  );
}
