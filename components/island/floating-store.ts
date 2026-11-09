import { create } from "zustand";

/**
 * Whether the desktop shell's floating island is up (V70). While it is, the
 * page's own island steps aside, so there are never two on screen. Always
 * false on the web.
 */
export const useFloatingIsland = create<{ floating: boolean }>(() => ({ floating: false }));
