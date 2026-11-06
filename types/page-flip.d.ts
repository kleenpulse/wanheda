// page-flip 2.0.7 ships no type declarations. This covers the part of its API
// the reader's book (components/reader/pdf/book-view.tsx) uses, read from the
// package's own src/ (PageFlip.ts, Settings.ts, Render/Render.ts).

declare module "page-flip" {
  export type FlipState = "user_fold" | "fold_corner" | "flipping" | "read";
  export type Orientation = "portrait" | "landscape";

  export interface FlipSettings {
    startPage: number;
    size: "fixed" | "stretch";
    width: number;
    height: number;
    minWidth: number;
    maxWidth: number;
    minHeight: number;
    maxHeight: number;
    drawShadow: boolean;
    flippingTime: number;
    usePortrait: boolean;
    startZIndex: number;
    autoSize: boolean;
    maxShadowOpacity: number;
    showCover: boolean;
    mobileScrollSupport: boolean;
    clickEventForward: boolean;
    useMouseEvents: boolean;
    swipeDistance: number;
    showPageCorners: boolean;
    disableFlipByClick: boolean;
  }

  export interface PageRect {
    left: number;
    top: number;
    width: number;
    height: number;
    pageWidth: number;
  }

  export interface FlipEvent<T> {
    data: T;
    object: PageFlip;
  }

  /** The renderer. Its rAF loop runs for the life of the page: see book-view.tsx. */
  export interface FlipRender {
    getRect(): PageRect;
    getOrientation(): Orientation;
  }

  export class PageFlip {
    constructor(root: HTMLElement, settings: Partial<FlipSettings>);
    loadFromHTML(items: HTMLElement[]): void;
    updateFromHtml(items: HTMLElement[]): void;
    destroy(): void;
    update(): void;
    turnToPage(index: number): void;
    flipNext(corner?: "top" | "bottom"): void;
    flipPrev(corner?: "top" | "bottom"): void;
    flip(index: number, corner?: "top" | "bottom"): void;
    getCurrentPageIndex(): number;
    getPageCount(): number;
    getOrientation(): Orientation;
    getBoundsRect(): PageRect;
    getSettings(): FlipSettings;
    getState(): FlipState;
    getRender(): FlipRender;
    on(event: "flip", cb: (e: FlipEvent<number>) => void): PageFlip;
    on(event: "changeState", cb: (e: FlipEvent<FlipState>) => void): PageFlip;
    on(event: "changeOrientation", cb: (e: FlipEvent<Orientation>) => void): PageFlip;
    on(event: "init" | "update", cb: (e: FlipEvent<{ page: number; mode: Orientation }>) => void): PageFlip;
    off(event: string): void;
  }
}
