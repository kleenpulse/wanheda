"use client";

import type * as React from "react";
import type { MdPlace } from "@/lib/reader/md";

// What the Markdown / text reader (md-reader.tsx) asks of a view: the scroll
// (md-scroll.tsx, T48) or the book (md-book.tsx, T49). Both read and move
// the reader's one place (V41, `md:<heading>:<y‰>`), so switching keeps it.

/** What the bars show about where reading is. */
export interface At {
  heading: string;
  percent: number;
  /** At the very start: nothing to go back to. */
  top: boolean;
}

export interface MdView {
  /** Shows an element of the text (a heading, a footnote): scrolls to it, or turns to its page. */
  show(target: Element): void;
  /** Brings a find match into sight if it isn't. */
  reveal(range: Range): void;
  /** Where reading is, as a client y over the rendered text: new words are found from here on. */
  readingY(): number;
  /** Paints find's matches (ranges over the rendered text); none clears them. */
  paint(ranges: readonly Range[], current: Range | undefined): void;
  /** The scroll: the next or previous section. The book: the next or previous page. */
  step(dir: 1 | -1): void;
  /** What auto-scroll moves, or null (the book). */
  scroller(): HTMLElement | null;
}

export interface ViewProps {
  text: string;
  kind: "md" | "txt";
  /** Text size, a multiple of BASE_PX. */
  scale: number;
  /** The reader's place: read on open, moved as reading moves. */
  placeRef: React.RefObject<MdPlace>;
  /** The element holding the rendered text (find, contents and links read it), or null as it goes. */
  onArticle: (el: HTMLElement | null) => void;
  onAt: (at: At) => void;
  /** The place moved: save it, at this percent. The view decides how often. */
  onReport: (percent: number) => void;
  /** A click on the text: in-document links are the reader's to follow. */
  onTextClick: (e: React.MouseEvent) => void;
  /** The document's title, for its region's name. */
  title: string;
}

/** Type size of the text at scale 1, px. */
export const BASE_PX = 17;

// Matches are painted with the CSS Custom Highlight API: no change to the
// document's DOM. Where it isn't supported, find still moves to each match.
function highlights(): HighlightRegistry | null {
  return typeof CSS !== "undefined" && "highlights" in CSS ? CSS.highlights : null;
}

export function paintRanges(ranges: readonly Range[], current: readonly Range[]) {
  const reg = highlights();
  if (!reg) return;
  if (ranges.length === 0) {
    unpaint();
    return;
  }
  reg.set("reader-find", new Highlight(...ranges));
  if (current.length > 0) reg.set("reader-find-now", new Highlight(...current));
  else reg.delete("reader-find-now");
}

export function unpaint() {
  const reg = highlights();
  reg?.delete("reader-find");
  reg?.delete("reader-find-now");
}

/** Headings the contents list and the place count: every h1–h6 with an id, footnotes' own heading left out. */
export function headingElements(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]")].filter((h) => !h.closest(".footnotes"));
}
