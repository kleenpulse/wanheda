import type * as React from "react";
import { cn } from "@/lib/utils";

/** A key cap (vxrcel-ui-design Kbd [R]). Inside a tooltip it inverts with the pill. */
export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm bg-sidebar px-1 font-sans text-xs font-medium text-muted-foreground select-none",
        "in-data-[slot=tooltip-content]:bg-background/20 in-data-[slot=tooltip-content]:text-background",
        className,
      )}
      {...props}
    />
  );
}
