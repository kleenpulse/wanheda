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
