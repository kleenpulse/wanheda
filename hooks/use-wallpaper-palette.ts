"use client";

import * as React from "react";
import { readPalette, samePalette, type WallpaperPalette } from "@/lib/prefs/wallpaper-palette";

/**
 * The skin's role tokens as bytes, for canvas and WebGL. Skin, theme and accent
 * all land on <html>, so it re-reads them when that element changes. Null until
 * the first client effect: the server has no computed styles.
 */
export function useWallpaperPalette(): WallpaperPalette | null {
  const [palette, setPalette] = React.useState<WallpaperPalette | null>(null);
  React.useEffect(() => {
    const root = document.documentElement;
    const read = () => {
      const next = readPalette(root);
      setPalette((prev) => (prev && samePalette(prev, next) ? prev : next));
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["class", "style", "data-skin", "data-accent"] });
    return () => {
      observer.disconnect();
    };
  }, []);
  return palette;
}
