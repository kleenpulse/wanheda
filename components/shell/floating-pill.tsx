"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { usePalette } from "@/components/shell/palette-store";
import { Kbd } from "@/components/ui/kbd";

/** Raven's floating "Ask" pill, pointed at the palette. Centred on the content column. */
export function FloatingPill() {
  const { open, setOpen } = usePalette();
  const mod = React.useSyncExternalStore(
    () => () => {},
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"),
    () => "Ctrl",
  );

  if (open) return null;
  return (
    <button
      type="button"
      onClick={() => {
        setOpen(true);
      }}
      className="glass fixed bottom-6 left-[calc(50%+var(--rail-w)/2)] z-30 hidden h-12 -translate-x-1/2 items-center gap-2.5 rounded-full px-5 text-sm text-foreground shadow-lift transition-[translate,box-shadow] duration-200 outline-none hover:-translate-y-0.5 hover:shadow-glow focus-visible:ring-2 focus-visible:ring-ring motion-reduce:hover:translate-y-0 md:flex"
    >
      <Search className="size-4 text-signal-ink dark:text-signal" strokeWidth={2} aria-hidden />
      Search or start a timer
      <Kbd>{mod}+K</Kbd>
    </button>
  );
}
