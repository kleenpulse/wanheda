import { create } from "zustand";

// The palette has several openers (Ctrl/⌘K, `/`, the floating pill, the tab
// bar's search button), none of them its parent: one tiny store, no relay.
interface PaletteState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const usePalette = create<PaletteState>((set) => ({
  open: false,
  setOpen: (open) => {
    set({ open });
  },
}));
