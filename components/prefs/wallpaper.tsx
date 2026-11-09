"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { usePrefs } from "@/components/prefs/prefs-provider";
import { Aurora } from "@/components/prefs/wallpapers/aurora";
import { Contour } from "@/components/prefs/wallpapers/contour";
import { Dots } from "@/components/prefs/wallpapers/dots";
import { Stars } from "@/components/prefs/wallpapers/stars";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { wallpaperFor, type AuroraEdge, type Scene as SceneName, type WallpaperCover } from "@/lib/prefs/prefs";
import { wallpaperPageFor } from "@/lib/prefs/wallpaper-pages";
import { useWallpaperPalette } from "@/hooks/use-wallpaper-palette";
import type { WallpaperPalette } from "@/lib/prefs/wallpaper-palette";

type Draw = React.ComponentType<{ palette: WallpaperPalette; reduced: boolean; edge?: AuroraEdge }>;

const SCENES: Record<SceneName, Draw> = {
  aurora: Aurora,
  contour: Contour,
  stars: Stars,
  dots: Dots,
};

function Scene({ name }: { name: SceneName }) {
  const palette = useWallpaperPalette();
  const reduced = useReducedMotion();
  const { prefs } = usePrefs();
  if (!palette) return null;
  const Draw = SCENES[name];
  // Aurora from the bottom rises from the screen's bottom edge, behind the
  // dock, and stays there as the page scrolls: fixed to the viewport, right
  // of the rail, faded out upward. Fixed escapes the sheet's overflow clip
  // (no transform or filter above it), and its own mask is the only one.
  const fromBottom = name === "aurora" && prefs.auroraEdge === "bottom";
  return (
    <div
      data-wallpaper={name}
      data-edge={fromBottom ? "bottom" : undefined}
      className={
        fromBottom
          ? "wallpaper-fade-up fixed right-0 bottom-0 left-(--rail-w) h-(--app-h)"
          : // One screen tall and faded out at the bottom: the scene sits behind the
            // top of the page, and a tall page never pays for a canvas it scrolls past.
            "wallpaper-fade absolute inset-x-0 top-0 h-(--app-h) max-h-full"
      }
    >
      <Draw palette={palette} reduced={reduced} edge={prefs.auroraEdge} />
    </div>
  );
}

/**
 * The scene the current page wears under the given cover, or null (SPEC V64).
 * Read during render, never in an effect: prefs and the pathname are both
 * known on the server, so the first HTML is already right.
 */
export function useWallpaper(cover: WallpaperCover): SceneName | null {
  const { prefs } = usePrefs();
  const pathname = usePathname();
  if (prefs.wallpaperCover !== cover) return null;
  const scene = wallpaperFor(prefs, wallpaperPageFor(pathname));
  return scene === "none" ? null : scene;
}

/**
 * Below the top bar: drawn inside each page's sheet, clipped to its rounded
 * top. It mounts with the page, so its fade-in covers the first draw on every hop.
 */
export function SheetWallpaper() {
  const scene = useWallpaper("sheet");
  return scene ? <Scene key={scene} name={scene} /> : null;
}

/**
 * The shell's <main>, with the whole-page wallpaper. It never remounts, so a
 * hop between pages with the same scene keeps the same canvas (and Aurora's
 * WebGL context); a different scene is a new key, and fades in.
 *
 * `data-wallpaper-cover="page"` is set in render while a whole-page scene
 * shows, so the server's HTML already has the see-through sheet. No z-index
 * and no `isolate` here: the scene comes first and PageFrame's root is
 * positioned, so the page paints over it, and overlays inside the page keep
 * stacking against the dock and the island as before.
 */
export function WallpaperMain({ children }: { children: React.ReactNode }) {
  const scene = useWallpaper("page");
  return (
    <main data-wallpaper-cover={scene ? "page" : undefined} className="relative min-w-0 flex-1">
      {scene ? (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-(--app-h) overflow-hidden">
          <Scene key={scene} name={scene} />
        </div>
      ) : null}
      {children}
    </main>
  );
}
