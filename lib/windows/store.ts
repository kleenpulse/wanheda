import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { WindowId } from "@/lib/modules";
import type { Placement } from "./geometry";
import { EMPTY_WINDOWS, isOnTop, lower, raise, sanitizeWindows, type WindowsSnapshot } from "./state";

// The mini-window store (FR-SHELL-5): which windows are open and where each
// one was last put, persisted per device (see state.ts). The layer, the dock
// and the palette all read it, so none of them is the others' parent.

export const WINDOWS_STORAGE_KEY = "wanheda-windows";

interface WindowsState extends WindowsSnapshot {
  /** Opens a window, or brings it to the top if it is already open. */
  openWindow: (id: WindowId) => void;
  closeWindow: (id: WindowId) => void;
  place: (id: WindowId, p: Placement) => void;
}

export const useWindows = create<WindowsState>()(
  persist(
    (set) => ({
      ...EMPTY_WINDOWS,
      openWindow(id) {
        // Focus raises too, so the common case (already on top) must not re-render.
        set((s) => (isOnTop(s.open, id) ? s : { open: raise(s.open, id) }));
      },
      closeWindow(id) {
        set((s) => ({ open: lower(s.open, id) }));
      },
      place(id, p) {
        set((s) => ({ placements: { ...s.placements, [id]: p } }));
      },
    }),
    {
      name: WINDOWS_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): WindowsSnapshot => ({ placements: s.placements, open: s.open }),
      merge: (persisted, current) => ({ ...current, ...sanitizeWindows(persisted) }),
      // Rehydrated by the layer after mount: the server renders no windows.
      skipHydration: true,
    },
  ),
);
