import { MODULES, SYSTEM_PAGES, isActive, type ModuleManifest } from "@/lib/modules";
import { WALLPAPER_PAGES, type WallpaperPage } from "./prefs";

// Which wallpaper page a URL is on (SPEC V64). Apart from prefs.ts, so the
// pure prefs (shared with the server action and the boot script) never pull
// in the registry and its icons.

function isWallpaperPage(id: string): id is WallpaperPage {
  return (WALLPAPER_PAGES as readonly string[]).includes(id);
}

/** The pages in rail order, with their titles and icons: Settings lists them in per-page mode. */
export const WALLPAPER_PAGE_LIST: readonly (ModuleManifest & { id: WallpaperPage })[] = [...MODULES, ...SYSTEM_PAGES].flatMap(
  (m: ModuleManifest) => (isWallpaperPage(m.id) ? [{ ...m, id: m.id }] : []),
);

/** The page a pathname is on, or null for a route no page owns (it then wears no wallpaper). */
export function wallpaperPageFor(pathname: string | null): WallpaperPage | null {
  if (!pathname) return null;
  return WALLPAPER_PAGE_LIST.find((m) => isActive(pathname, m.route))?.id ?? null;
}
