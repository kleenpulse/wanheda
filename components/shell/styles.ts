// Shared class strings for the shell. A plain module on purpose: a constant
// exported from a "use client" file reaches a server importer as a reference.

/** The 44px circle every rail and tab-bar control is built on (Raven's `circle`). */
export const circle =
  "relative inline-flex size-11 shrink-0 items-center justify-center rounded-full outline-none transition-[background-color,color,box-shadow,transform] duration-200 focus-visible:ring-2 focus-visible:ring-ring active:scale-95 [&_svg]:size-[18px]";

/** Idle chrome: colour-only hover (vxrcel-ui-design motion rule). */
export const idleInk = "text-ink-2 hover:text-foreground";

/**
 * The selected nav item: ink on paper (Ember). In dark skins it wears the
 * rail's own band with the signal glow, like the Wanheda mark above it: a
 * dark well in the capsule rather than a tint.
 */
export const activeFill = "bg-inverse dark:bg-band dark:shadow-glow";
export const activeInk = "text-inverse-foreground dark:text-signal";
