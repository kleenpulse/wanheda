"use client";

import * as React from "react";
import { usePrefs } from "@/components/prefs/prefs-provider";
import { Aurora } from "@/components/prefs/wallpapers/aurora";
import { Contour } from "@/components/prefs/wallpapers/contour";
import { Dots } from "@/components/prefs/wallpapers/dots";
import { Stars } from "@/components/prefs/wallpapers/stars";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import type { Wallpaper as WallpaperName } from "@/lib/prefs/prefs";
import { readPalette, samePalette, type WallpaperPalette } from "@/lib/prefs/wallpaper-palette";

type Scene = React.ComponentType<{ palette: WallpaperPalette; reduced: boolean }>;

const SCENES: Record<Exclude<WallpaperName, "none">, Scene> = {
  aurora: Aurora,
  contour: Contour,
  stars: Stars,
  dots: Dots,
};

/** Skin, theme and accent all land on <html>: re-read the tokens when it changes. */
function useWallpaperPalette(): WallpaperPalette | null {
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

function Scene({ name }: { name: Exclude<WallpaperName, "none"> }) {
  const palette = useWallpaperPalette();
  const reduced = useReducedMotion();
  if (!palette) return null;
  const Draw = SCENES[name];
  return (
    // One screen tall and faded out at the bottom: the scene sits behind the
    // top of the board, and a tall board never pays for a canvas it scrolls past.
    <div data-wallpaper={name} className="wallpaper-fade absolute inset-x-0 top-0 h-svh max-h-full">
      <Draw key={name} palette={palette} reduced={reduced} />
    </div>
  );
}

/** Home's wallpaper (FR-SHELL-7): a live scene drawn in the skin's tokens, or nothing. */
export function Wallpaper() {
  const { prefs } = usePrefs();
  if (prefs.wallpaper === "none") return null;
  return <Scene name={prefs.wallpaper} />;
}
