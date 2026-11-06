"use client";

import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Check, ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

// shadcn's Select anatomy, vendored on Base UI (never `shadcn init`, CLAUDE.md)
// and dressed in the house frost: a field-like trigger, a `glass-menu` popup
// (translucent, deep blur, solid under reduced transparency) and rows that
// tint with the ink instead of a flat fill. Replaces native <select>, whose
// OS popup ignores the theme. Keyboard: arrows, typeahead, Enter/Space,
// Escape; the label's htmlFor points at the trigger button, which names it.

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;

const TRIGGER = cn(
  "group/trigger flex h-11 w-full min-w-0 items-center justify-between gap-2.5 rounded-[14px] bg-sheet pr-2.5 pl-2 text-left text-[14px] text-foreground ring-1 ring-border outline-none select-none",
  "transition-[box-shadow,background-color] duration-150 hover:bg-card focus-visible:ring-2 focus-visible:ring-ring data-[popup-open]:ring-2 data-[popup-open]:ring-ring",
  "disabled:opacity-50 dark:bg-card-nested dark:ring-glass-border dark:hover:bg-accent",
);

export function SelectTrigger({ className, children, ...props }: SelectPrimitive.Trigger.Props) {
  return (
    <SelectPrimitive.Trigger className={cn(TRIGGER, className)} {...props}>
      {children}
      <SelectPrimitive.Icon className="flex shrink-0 text-ink-3 transition-colors group-hover/trigger:text-ink-2">
        <ChevronsUpDown aria-hidden className="size-4" strokeWidth={1.75} />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return <SelectPrimitive.Value className={cn("flex min-w-0 flex-1 items-center gap-2.5 data-[placeholder]:text-ink-3 [&>span:last-child]:truncate", className)} {...props} />;
}

export function SelectContent({
  className,
  children,
  sideOffset = 8,
  align = "start",
  alignItemWithTrigger = false,
  ...props
}: SelectPrimitive.Popup.Props & {
  sideOffset?: number;
  align?: SelectPrimitive.Positioner.Props["align"];
  alignItemWithTrigger?: boolean;
}) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        sideOffset={sideOffset}
        align={align}
        alignItemWithTrigger={alignItemWithTrigger}
        collisionPadding={10}
        className="z-[200] outline-none"
      >
        <SelectPrimitive.Popup
          className={cn(
            "glass-menu relative max-h-[min(24rem,var(--available-height))] min-w-(--anchor-width) origin-(--transform-origin) overflow-hidden rounded-[20px] text-foreground shadow-lift outline-none",
            "transition-[opacity,scale,translate] duration-200 ease-out-quint",
            "data-[starting-style]:-translate-y-1 data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0",
            "data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0 data-[ending-style]:duration-100",
            "motion-reduce:data-[starting-style]:translate-y-0 motion-reduce:data-[starting-style]:scale-100",
            className,
          )}
          {...props}
        >
          <SelectPrimitive.ScrollUpArrow className="absolute inset-x-0 top-0 z-10 flex h-7 items-center justify-center text-ink-2">
            <ChevronUp aria-hidden className="size-4" />
          </SelectPrimitive.ScrollUpArrow>
          <SelectPrimitive.List className="max-h-[inherit] scroll-py-2 overflow-x-hidden overflow-y-auto scroll-fade overscroll-contain p-1.5">{children}</SelectPrimitive.List>
          <SelectPrimitive.ScrollDownArrow className="absolute inset-x-0 bottom-0 z-10 flex h-7 items-center justify-center text-ink-2">
            <ChevronDown aria-hidden className="size-4" />
          </SelectPrimitive.ScrollDownArrow>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      className={cn(
        "relative flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-[14px] py-1.5 pr-9 pl-2 text-[13.5px] text-ink-2 outline-none select-none",
        "transition-colors duration-100 data-[highlighted]:bg-foreground/[0.06] data-[highlighted]:text-foreground dark:data-[highlighted]:bg-foreground/[0.08]",
        "data-[selected]:font-medium data-[selected]:text-foreground data-[disabled]:cursor-default data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="flex min-w-0 flex-1 items-center gap-2.5 [&>span:last-child]:truncate">{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-3 flex text-foreground">
        <Check aria-hidden className="size-4" strokeWidth={2.25} />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export function SelectGroupLabel({ className, ...props }: SelectPrimitive.GroupLabel.Props) {
  return <SelectPrimitive.GroupLabel className={cn("readout px-2.5 pt-2.5 pb-1.5", className)} {...props} />;
}

export function SelectSeparator({ className }: { className?: string }) {
  return <SelectPrimitive.Separator className={cn("mx-2 my-1.5 h-px bg-border dark:bg-glass-border", className)} />;
}
