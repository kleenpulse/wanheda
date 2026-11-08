"use client";

// The goo-morph tooltip, ported from admin_shadow-garden components/ui/tooltip.tsx
// (itself from Raven). bg-foreground / text-background are role tokens, so it
// inverts with the skin: ink on paper in Ember, pale on teal in Nebula.

import * as React from "react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { cn } from "@/lib/utils";

type Side = TooltipPrimitive.Positioner.Props["side"];
type Align = TooltipPrimitive.Positioner.Props["align"];
type TipHandle = TooltipPrimitive.Handle<React.ReactNode>;

/*
 * The morph: the pill and its arrow are drawn inside an SVG goo filter
 * (blur, then an alpha threshold), which melts them together. The arrow stays
 * where it points at the trigger and carries a "stem" reaching into the gap.
 * On open the pill starts shrunk against the trigger and travels out; closing
 * shrinks it back into the trigger point (`--transform-origin`, from Base UI).
 * The label sits outside the filter so the text stays crisp.
 *
 * `--tip-from` points from the pill's resting spot back toward the trigger;
 * percentages resolve against the pill itself, so wide pills travel further.
 */
const popupClass = cn(
  "group/tip relative isolate z-[200] flex h-[var(--popup-height,auto)] w-[var(--popup-width,auto)] max-w-xs text-xs text-background",
  "data-[side=top]:[--tip-from:0_calc(40%_+_var(--gap))] data-[side=bottom]:[--tip-from:0_calc(-40%_-_var(--gap))]",
  "data-[side=left]:[--tip-from:calc(35%_+_var(--gap))_0] data-[side=inline-start]:[--tip-from:calc(35%_+_var(--gap))_0]",
  "data-[side=right]:[--tip-from:calc(-35%_-_var(--gap))_0] data-[side=inline-end]:[--tip-from:calc(-35%_-_var(--gap))_0]",
  // The popup owns the longest transition: Base UI unmounts once the popup's
  // own animations finish (it doesn't wait on descendants).
  "origin-(--transform-origin) transition-[width,height,opacity,scale] duration-250 ease-out-quint",
  "data-[ending-style]:scale-0 data-[ending-style]:opacity-0 data-[ending-style]:ease-[cubic-bezier(0.4,0,0.2,1)]",
  "data-[ending-style]:duration-[250ms,250ms,140ms,220ms] data-[ending-style]:delay-[0ms,0ms,80ms,0ms]",
  "data-[instant]:transition-none",
);

const bodyClass = cn(
  "absolute inset-6 rounded-md bg-foreground",
  "transition-[translate,scale] duration-300 ease-out-quint",
  "group-data-[starting-style]/tip:scale-50 group-data-[starting-style]/tip:[translate:var(--tip-from)]",
  "group-data-[instant]/tip:transition-none",
);

// Centred on the pill's resting edge; Base UI slides it along that edge to
// point at the trigger even when the pill is pushed off a screen edge.
const arrowClass = cn(
  "absolute size-3",
  "before:absolute before:inset-0 before:rotate-45 before:rounded-[2px] before:bg-foreground",
  "transition-[left,top] duration-250 ease-out-quint group-data-[instant]/tip:transition-none",
  "data-[side=top]:-bottom-1.5 data-[side=bottom]:-top-1.5",
  "data-[side=left]:-right-1.5 data-[side=inline-start]:-right-1.5",
  "data-[side=right]:-left-1.5 data-[side=inline-end]:-left-1.5",
);

// Pushed from the arrow's centre across the gap, stopping 3px short of the trigger.
const stemClass = cn(
  "absolute top-1/2 left-1/2 size-3.5 rounded-full bg-foreground [translate:-50%_-50%]",
  "group-data-[side=top]/tip:[translate:-50%_calc(-50%_+_var(--gap)_-_3px)]",
  "group-data-[side=bottom]/tip:[translate:-50%_calc(-50%_-_var(--gap)_+_3px)]",
  "group-data-[side=left]/tip:[translate:calc(-50%_+_var(--gap)_-_3px)_-50%] group-data-[side=inline-start]/tip:[translate:calc(-50%_+_var(--gap)_-_3px)_-50%]",
  "group-data-[side=right]/tip:[translate:calc(-50%_-_var(--gap)_+_3px)_-50%] group-data-[side=inline-end]/tip:[translate:calc(-50%_-_var(--gap)_+_3px)_-50%]",
  "scale-0 transition-[scale] duration-160 delay-110",
  "group-data-[starting-style]/tip:scale-100 group-data-[starting-style]/tip:delay-0",
  "group-data-[instant]/tip:hidden",
);

const labelClass = cn(
  "relative z-10 inline-flex items-center gap-1.5 px-3 py-1.5 has-data-[slot=kbd]:pr-1.5",
  "**:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm",
  "transition-[opacity,filter] duration-160 delay-60",
  "group-data-[starting-style]/tip:opacity-0 group-data-[starting-style]/tip:blur-[3px]",
  "group-data-[ending-style]/tip:opacity-0 group-data-[ending-style]/tip:blur-[3px] group-data-[ending-style]/tip:delay-0 group-data-[ending-style]/tip:duration-80",
  "group-data-[instant]/tip:transition-none",
);

// Switching triggers inside a TooltipGroup: the outgoing label blurs away
// while the incoming one blurs in, as the pill slides and resizes under them.
const viewportClass = cn(
  "relative",
  "[&_[data-current]]:transition-[opacity,filter] [&_[data-current]]:duration-200",
  "[&_[data-current][data-starting-style]]:opacity-0 [&_[data-current][data-starting-style]]:blur-[3px]",
  "[&_[data-previous]]:top-0 [&_[data-previous]]:left-0 [&_[data-previous]]:w-[var(--popup-width)]",
  "[&_[data-previous]]:transition-[opacity,filter] [&_[data-previous]]:duration-150",
  "[&_[data-previous][data-ending-style]]:opacity-0 [&_[data-previous][data-ending-style]]:blur-[3px]",
  "[[data-instant]_&_[data-current]]:transition-none [[data-instant]_&_[data-previous]]:transition-none",
);

function MorphPopup({
  side = "top",
  sideOffset = 8,
  align = "center",
  glide = false,
  container,
  className,
  children,
  ...props
}: TooltipPrimitive.Popup.Props & {
  side?: Side;
  sideOffset?: number;
  align?: Align;
  glide?: boolean;
  /** Where the tooltip renders, if not the body: a full-screen element shows only what is inside it. */
  container?: HTMLElement | null | undefined;
}) {
  // useId output isn't a valid url(#…) fragment as-is.
  const filterId = `tip-goo-${React.useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  // Mid-glide the pill is still the old label's width; wrapping would make
  // the new label reflow onto two lines until the resize catches up.
  const label = <span className={cn(labelClass, glide && "whitespace-nowrap")}>{children}</span>;

  return (
    <TooltipPrimitive.Portal container={container}>
      {/* Fixed: the goo layer bleeds 24px past the pill, and an absolute
          positioner at the viewport edge would widen the page with it. */}
      <TooltipPrimitive.Positioner
        positionMethod="fixed"
        collisionPadding={8}
        align={align}
        side={side}
        sideOffset={sideOffset}
        className={cn(
          "isolate z-[200]",
          glide &&
            "h-(--positioner-height) w-(--positioner-width) max-w-(--available-width) transition-[top,left,right,bottom,transform] duration-250 ease-out-quint data-instant:transition-none",
        )}
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(popupClass, className)}
          style={{ "--gap": `${sideOffset}px` } as React.CSSProperties}
          {...props}
        >
          <svg aria-hidden width="0" height="0" className="absolute">
            <filter id={filterId} x="-20%" y="-50%" width="140%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
              <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" />
            </filter>
          </svg>
          <span aria-hidden className="pointer-events-none absolute -inset-6" style={{ filter: `url(#${filterId})` }}>
            <span className={bodyClass} />
            {/* Same box as the popup, so the arrow's coordinates line up. */}
            <span className="absolute inset-6">
              <TooltipPrimitive.Arrow className={arrowClass}>
                <span className={stemClass} />
              </TooltipPrimitive.Arrow>
            </span>
          </span>
          {glide ? <TooltipPrimitive.Viewport className={viewportClass}>{label}</TooltipPrimitive.Viewport> : label}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

type TooltipGroupValue = { handle: TipHandle; side: Side; sideOffset: number };
const TooltipGroupContext = React.createContext<TooltipGroupValue | null>(null);

/**
 * One tooltip shared by a cluster of triggers (render them with `Tip`).
 * Moving between siblings glides the open tooltip instead of re-opening it.
 */
export function TooltipGroup({
  side = "top",
  sideOffset = 8,
  container,
  children,
}: {
  side?: Side;
  sideOffset?: number;
  /** Where the tooltip renders, if not the body (a full-screen player). */
  container?: HTMLElement | null | undefined;
  children: React.ReactNode;
}) {
  const [handle] = React.useState(() => TooltipPrimitive.createHandle<React.ReactNode>());
  const value = React.useMemo(() => ({ handle, side, sideOffset }), [handle, side, sideOffset]);
  return (
    <TooltipPrimitive.Provider delay={0}>
      <TooltipGroupContext.Provider value={value}>
        {children}
        <TooltipPrimitive.Root handle={handle}>
          {({ payload }) => (
            <MorphPopup glide side={side} sideOffset={sideOffset} container={container}>
              {payload}
            </MorphPopup>
          )}
        </TooltipPrimitive.Root>
      </TooltipGroupContext.Provider>
    </TooltipPrimitive.Provider>
  );
}

/**
 * A trigger with its tooltip text. Inside a `TooltipGroup` it joins the shared
 * tooltip; on its own it's a regular one.
 */
export function Tip({
  label,
  side,
  sideOffset,
  container,
  ...props
}: Omit<TooltipPrimitive.Trigger.Props<React.ReactNode>, "handle" | "payload"> & {
  label: React.ReactNode;
  side?: Side;
  sideOffset?: number;
  /** Where a lone tooltip renders, if not the body (inside a group, the group's container rules). */
  container?: HTMLElement | null | undefined;
}) {
  const group = React.useContext(TooltipGroupContext);
  if (group) {
    // A short grace bridges the gap between sibling triggers so the tooltip
    // glides instead of closing and re-opening; longer reads as lag on leave.
    return (
      <TooltipPrimitive.Trigger
        data-slot="tooltip-trigger"
        handle={group.handle}
        payload={label}
        closeDelay={60}
        {...props}
      />
    );
  }
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
      <MorphPopup side={side} container={container} {...(sideOffset === undefined ? {} : { sideOffset })}>
        {label}
      </MorphPopup>
    </TooltipPrimitive.Root>
  );
}
