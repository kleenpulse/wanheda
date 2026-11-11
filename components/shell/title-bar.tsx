"use client";

import { Menu } from "lucide-react";
import * as React from "react";
import { desktopBridge } from "@/lib/platform/desktop";
import { Tip } from "@/components/ui/tooltip";

/** Window Controls Overlay (Chromium; not in TypeScript's DOM types yet). */
type ControlsOverlay = EventTarget & { readonly visible: boolean };

/**
 * The desktop main window's title bar, the way VS Code draws its own: the
 * window has no Windows title bar, only Windows' caption buttons over the top
 * right (Window Controls Overlay). This strip fills the rest, drags the
 * window, and tells the shell its colours so the buttons match the skin.
 *
 * Its height is `--tb` (the overlay's height, from CSS env()), so on the web
 * and in every other window it is 0 tall and has nothing in it. Body padding
 * keeps the page below it (app/globals.css).
 */
export function TitleBar() {
  const ref = React.useRef<HTMLDivElement>(null);
  const [overlay, setOverlay] = React.useState(false);

  React.useEffect(() => {
    const bridge = desktopBridge();
    const wco = (navigator as Navigator & { windowControlsOverlay?: ControlsOverlay }).windowControlsOverlay;
    const el = ref.current;
    if (!bridge || !wco || !el) return;
    // Full screen hides the overlay (and --tb drops to 0): the bar's contents go with it.
    const follow = () => {
      setOverlay(wco.visible);
    };
    follow();
    wco.addEventListener("geometrychange", follow);
    let sent = "";
    const send = () => {
      const style = getComputedStyle(el);
      // Composited over the page's own colour (the bar's is opaque; this only guards a skin that isn't).
      const color = hex(style.backgroundColor, getComputedStyle(document.body).backgroundColor);
      const symbol = color && hex(style.color, color);
      if (!color || !symbol || `${color}${symbol}` === sent) return;
      sent = `${color}${symbol}`;
      bridge.titleBar.colors({ color, symbol });
    };
    send();
    // The skin (html.dark, data-skin, data-accent) changes on the root element.
    const observer = new MutationObserver(send);
    observer.observe(document.documentElement, { attributes: true });
    return () => {
      observer.disconnect();
      wco.removeEventListener("geometrychange", follow);
    };
  }, []);

  function openMenu(event: React.MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    desktopBridge()?.titleBar.menu({ x: rect.left, y: rect.bottom });
  }

  return (
    <div
      ref={ref}
      className="fixed inset-x-0 top-0 z-[70] flex h-(--tb) items-center overflow-hidden bg-background text-muted-foreground select-none [app-region:drag]"
    >
      {overlay ? (
        <div className="flex h-full w-[env(titlebar-area-width,100%)] items-center gap-2 pl-[env(titlebar-area-x,0px)]">
          <Tip
            type="button"
            aria-label="Menu"
            label="Menu"
            onClick={openMenu}
            className="ml-1 inline-flex h-full w-10 items-center justify-center transition-colors hover:bg-foreground/8 hover:text-foreground focus-visible:outline-none focus-visible:bg-foreground/10 [app-region:no-drag]"
          >
            <Menu className="size-4" aria-hidden />
          </Tip>
          <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" aria-hidden>
            <path d="M5 9.5 8.2 18 12 11.5 15.8 18 19 9.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="5.5" r="1.5" className="fill-signal" />
          </svg>
          <span className="readout">Wanheda</span>
        </div>
      ) : null}
    </div>
  );
}

let canvas: CanvasRenderingContext2D | null = null;

/**
 * Any CSS colour (oklch, color-mix, with alpha) as `#rrggbb`, the only form the
 * shell takes: painted over `under` on a 1-pixel canvas and read back.
 */
function hex(css: string, under: string): string | null {
  canvas ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!canvas) return null;
  canvas.globalCompositeOperation = "source-over";
  canvas.fillStyle = under;
  canvas.fillRect(0, 0, 1, 1);
  canvas.fillStyle = css;
  canvas.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = canvas.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}
