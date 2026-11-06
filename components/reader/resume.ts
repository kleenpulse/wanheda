"use client";

import * as React from "react";
import { NO_PLACE_AT, moveAt, openWrite, placeFromElsewhere, type Progress, type ReaderDoc } from "@/lib/reader/reader";
import { useReaderRuntime } from "./reader-provider";

// One open document's place across devices (V41, T51), shared by the PDF and
// the Markdown reader.
//
// Only the owner's own moves are saved with a new clock. A place the reader
// sets by itself (opened from the device's copy of the library, put back after
// a reflow, a view made again) is not news: it was saved before, maybe by an
// older copy, and stamping it now would overwrite the page another device read
// to since. So a place is saved only after the owner has pressed, scrolled,
// touched or typed since the place was last set; the open sends the place it
// opened at under that place's own clock (openWrite).
//
// The other way: when the library brings a place saved later than the one on
// screen (the server's answer to the open, or a refetch when the tab comes
// back), the reader goes there. Close on the desktop, open on the phone: same
// page.

/** Presses, scrolls and touches on the reader's stage; keys anywhere (the readers listen on the window). */
const STAGE_MOVES = ["pointerdown", "wheel", "touchstart"] as const;

export interface Resume {
  /** The place moved: saved if the owner moved it, under a clock after the place it left. */
  save(locator: string, percent: number): void;
  /** The open: once, with the place it opened at. */
  open(locator: string, percent: number): void;
}

/**
 * `onElsewhere` gets a place saved later on another device (or tab): the
 * reader parses it and shows it. Until the owner moves again nothing is saved.
 */
export function useResume(doc: ReaderDoc, stage: HTMLElement | null, onElsewhere: (p: Progress) => void): Resume {
  const runtime = useReaderRuntime();
  const [openedFrom] = React.useState(doc.progress);
  /** The clock of the place on screen. */
  const shownAt = React.useRef(openedFrom?.at ?? NO_PLACE_AT);
  const moved = React.useRef(false);
  const live = React.useRef(onElsewhere);
  React.useLayoutEffect(() => {
    live.current = onElsewhere;
  });

  React.useEffect(() => {
    if (!stage) return;
    const mark = () => {
      moved.current = true;
    };
    // A tab put away may come back after another device read on: a reflow on its return (a resize) must not
    // save its old place over the newer one before the library catches up. Back in view, it needs a fresh move
    // (Reviewer nit). Reset on return, not on leaving: a report still in flight as the tab hides is a real move.
    const away = () => {
      if (document.visibilityState === "visible") moved.current = false;
    };
    const opts = { capture: true, passive: true };
    for (const t of STAGE_MOVES) stage.addEventListener(t, mark, opts);
    window.addEventListener("keydown", mark, opts);
    document.addEventListener("visibilitychange", away);
    return () => {
      for (const t of STAGE_MOVES) stage.removeEventListener(t, mark, opts);
      window.removeEventListener("keydown", mark, opts);
      document.removeEventListener("visibilitychange", away);
    };
  }, [stage]);

  React.useEffect(() => {
    const next = placeFromElsewhere(doc.progress, shownAt.current);
    if (!next) return;
    shownAt.current = next.at;
    moved.current = false;
    live.current(next);
  }, [doc.progress]);

  const docId = doc.id;
  return React.useMemo<Resume>(
    () => ({
      save(locator, percent) {
        if (!moved.current) return;
        const at = moveAt(Date.now(), shownAt.current);
        shownAt.current = at;
        runtime.report({ documentId: docId, locator, percent, at });
      },
      open(locator, percent) {
        runtime.report(openWrite(docId, locator, percent, openedFrom, Date.now()));
      },
    }),
    [runtime, docId, openedFrom],
  );
}
