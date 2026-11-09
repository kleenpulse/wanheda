"use client";

import { Toast as ToastPrimitive } from "@base-ui/react/toast";
import { Lock } from "lucide-react";

/*
  Short notes pinned beside an element, or at the pointer (via notePoint),
  instead of the corner toast stack. Ported from ellum-harness's anchoredToast.
  The shell mounts one AnchoredNotes; anything calls anchoredNote.add().
*/

export const anchoredNote = ToastPrimitive.createToastManager();

let point: HTMLDivElement | null = null;

/** A zero-size element at a viewport point, for anchoring a note where the pointer is. */
export function notePoint(x: number, y: number): HTMLElement {
  if (!point) {
    point = document.createElement("div");
    point.setAttribute("aria-hidden", "true");
    point.style.cssText = "position:fixed;width:0;height:0;pointer-events:none";
    document.body.append(point);
  }
  point.style.left = `${x}px`;
  point.style.top = `${y}px`;
  return point;
}

function NoteList() {
  const { toasts } = ToastPrimitive.useToastManager();
  return toasts.map((note) => (
    <ToastPrimitive.Positioner key={note.id} toast={note} sideOffset={12} collisionPadding={12} className="z-[200]">
      {/* The menus' surface and layer: it can float over a video or the open palette. */}
      <ToastPrimitive.Root
        toast={note}
        className="glass pointer-events-auto flex max-w-xs items-start gap-2.5 rounded-[18px] px-3.5 py-3 text-foreground shadow-lift outline-none transition-[opacity,scale] duration-200 ease-out-quint data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none"
      >
        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-signal-soft text-signal-ink [&_svg]:size-3.5">
          <Lock strokeWidth={2} />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <ToastPrimitive.Title className="text-[13px] font-medium" />
          <ToastPrimitive.Description className="text-[12.5px] text-ink-2" />
        </div>
      </ToastPrimitive.Root>
    </ToastPrimitive.Positioner>
  ));
}

/** Renders `anchoredNote` notes; mount once, beside the Toaster. */
export function AnchoredNotes() {
  return (
    <ToastPrimitive.Provider toastManager={anchoredNote} timeout={3500}>
      <ToastPrimitive.Portal>
        <ToastPrimitive.Viewport className="outline-none">
          <NoteList />
        </ToastPrimitive.Viewport>
      </ToastPrimitive.Portal>
    </ToastPrimitive.Provider>
  );
}
