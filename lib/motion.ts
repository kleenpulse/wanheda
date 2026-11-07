/** Every shared-layout indicator: pill tabs, nav rail, sidebar active row. Slides and settles with a hint of overshoot. */
export const TAB_SPRING = { type: "spring", stiffness: 350, damping: 30 } as const;

/** Dialogs that grow out of their trigger. */
export const DIALOG_SPRING = { type: "spring", stiffness: 320, damping: 34, mass: 0.8 } as const;

/** Banners and toasts that slide in. Exit is a plain fade: { opacity: 0, y: 8, duration: 0.16 }. */
export const BANNER_SPRING = { type: "spring", stiffness: 420, damping: 34 } as const;

/** House ease-out (quint-like). Entrances, reveals, popups. CSS twin: --ease-out-quint. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Soft in-out for slow morphs: a theme "dusk" tween, rail tick morphs. */
export const EASE_IN_OUT = [0.45, 0.05, 0.2, 1] as const;

/** Scroll-scrub smoothing for useSpring(scrollYProgress, SCRUB_SPRING). */
export const SCRUB_SPRING = { damping: 40, stiffness: 220, restDelta: 0.0005 } as const;

/** A mini window settling onto an edge after a drop: quick, barely any overshoot. */
export const SNAP_SPRING = { type: "spring", stiffness: 520, damping: 42, mass: 0.7 } as const;

/** The dock's swell under the pointer. Low mass so the peak keeps up with a fast sweep. */
export const DOCK_SPRING = { stiffness: 320, damping: 24, mass: 0.1 } as const;

/** Parallax layers easing toward the pointer (the empty-state mark; from ellum-harness AvatarStage). */
export const FOLLOW_SPRING = { stiffness: 140, damping: 18, mass: 0.6 } as const;

/** Sound ducking under speech (V60): seconds to drop to the duck level, and to come back. Audio, so reduced motion doesn't apply. */
export const DUCK_RAMP = { down: 0.25, up: 0.6 } as const;

/**
 * The island's morph between pill and card (user 2026-11-07: smooth, springy, closing a bit quicker
 * than opening). `visualDuration` is when it looks landed; `bounce` keeps the overshoot. `close`
 * also carries the pill's own moves (a swap between activities).
 */
export const ISLAND_SPRING = {
  open: { type: "spring", visualDuration: 0.55, bounce: 0.32 },
  close: { type: "spring", visualDuration: 0.42, bounce: 0.25 },
} as const;

/** The island's incoming content: waits for the shape to all but land, then fades in. */
export const ISLAND_CONTENT_IN = {
  open: { delay: 0.2, duration: 0.36 },
  close: { delay: 0.14, duration: 0.28 },
} as const;
