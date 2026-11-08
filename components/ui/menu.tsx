"use client";

import type * as React from "react";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// A dropdown menu on Base UI (focus, typeahead, click-outside, portal), in
// Raven's frosted menu anatomy. Glass is an overlay, so it gets the
// reduced-transparency solid from globals.css for free.

export const Menu = MenuPrimitive.Root;
export const MenuTrigger = MenuPrimitive.Trigger;

export function MenuContent({
  side = "bottom",
  align = "start",
  sideOffset = 8,
  container,
  className,
  children,
  ...props
}: MenuPrimitive.Popup.Props & {
  side?: MenuPrimitive.Positioner.Props["side"];
  align?: MenuPrimitive.Positioner.Props["align"];
  sideOffset?: number;
  /** Where the menu renders, if not the body: a full-screen element shows only what is inside it. */
  container?: HTMLElement | null | undefined;
}) {
  return (
    <MenuPrimitive.Portal container={container}>
      <MenuPrimitive.Positioner side={side} align={align} sideOffset={sideOffset} collisionPadding={8} className="z-[200] outline-none">
        <MenuPrimitive.Popup
          className={cn(
            "glass min-w-56 origin-(--transform-origin) rounded-[18px] p-1.5 text-foreground shadow-lift outline-none",
            "transition-[opacity,scale] duration-150 ease-out-quint",
            "data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
            className,
          )}
          {...props}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

const itemClass =
  "flex h-9 w-full items-center gap-2.5 rounded-[12px] px-2.5 text-[13px] outline-none select-none transition-colors duration-100 data-[highlighted]:bg-muted data-[highlighted]:text-foreground dark:data-[highlighted]:bg-accent data-[disabled]:cursor-default data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-2";

export function MenuItem({ className, ...props }: MenuPrimitive.Item.Props) {
  return <MenuPrimitive.Item className={cn(itemClass, className)} {...props} />;
}

/**
 * A menu row that navigates. Base UI leaves a link's menu open (it expects the page to unmount it), but the
 * shell's menus (tab bar, account) outlive the navigation, so a tap closes the menu by default.
 */
export function MenuLinkItem({ className, closeOnClick = true, ...props }: MenuPrimitive.LinkItem.Props) {
  return <MenuPrimitive.LinkItem className={cn(itemClass, className)} closeOnClick={closeOnClick} {...props} />;
}

/** A choice of one (speed, caption size): the chosen row carries a check. */
export const MenuRadioGroup = MenuPrimitive.RadioGroup;

export function MenuRadioItem({ className, children, ...props }: MenuPrimitive.RadioItem.Props) {
  return (
    <MenuPrimitive.RadioItem className={cn(itemClass, "relative pr-8", className)} {...props}>
      {children}
      <MenuPrimitive.RadioItemIndicator className="absolute right-2.5 flex">
        <Check aria-hidden className="text-foreground!" />
      </MenuPrimitive.RadioItemIndicator>
    </MenuPrimitive.RadioItem>
  );
}

/** An on|off row: a check when on. */
export function MenuCheckboxItem({ className, children, ...props }: MenuPrimitive.CheckboxItem.Props) {
  return (
    <MenuPrimitive.CheckboxItem className={cn(itemClass, "relative pr-8", className)} {...props}>
      {children}
      <MenuPrimitive.CheckboxItemIndicator className="absolute right-2.5 flex">
        <Check aria-hidden className="text-foreground!" />
      </MenuPrimitive.CheckboxItemIndicator>
    </MenuPrimitive.CheckboxItem>
  );
}

export const MenuGroup = MenuPrimitive.Group;

export function MenuGroupLabel({ className, ...props }: MenuPrimitive.GroupLabel.Props) {
  return <MenuPrimitive.GroupLabel className={cn("readout px-2.5 pt-2 pb-1", className)} {...props} />;
}

/** A nested menu: `MenuSubmenu` around a `MenuSubmenuTrigger` and a `MenuContent`. */
export const MenuSubmenu = MenuPrimitive.SubmenuRoot;

export function MenuSubmenuTrigger({ className, children, ...props }: MenuPrimitive.SubmenuTrigger.Props) {
  return (
    <MenuPrimitive.SubmenuTrigger className={cn(itemClass, "data-popup-open:bg-muted dark:data-popup-open:bg-accent", className)} {...props}>
      {children}
      <ChevronRight aria-hidden className="ml-auto" />
    </MenuPrimitive.SubmenuTrigger>
  );
}

export function MenuSeparator({ className }: { className?: string }) {
  return <div role="separator" className={cn("mx-1 my-1 h-px bg-border", className)} />;
}

/** A non-interactive block at the top of a menu: who, which mode. */
export function MenuHeader({ children }: { children: React.ReactNode }) {
  return <div className="px-2.5 pt-1.5 pb-2.5">{children}</div>;
}
