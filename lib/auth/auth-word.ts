// The word the sign-in swarm spells (V82). The sign-in panel works out which
// method the owner is pointing at, focusing or waiting on; the swarm on
// /login draws it. Kept pure so the priority order is testable.

import type { SignInMethod } from "@/lib/auth/last-method";

export type AuthWord = "wanheda" | SignInMethod;

export const WORDS: Record<AuthWord, string> = {
  wanheda: "WANHEDA",
  passkey: "PASSKEY",
  github: "GITHUB",
  google: "GOOGLE",
};

/** Every string the swarm can spell, so one font size and baseline fit them all. */
export const WORD_LIST: readonly string[] = Object.values(WORDS);

/**
 * How long a change back to WANHEDA waits. Crossing the gap between two
 * buttons fires leave then enter; without the wait the swarm would start
 * flying home and turn round mid-air.
 */
export const WORD_GRACE_MS = 150;

export interface WordInputs {
  /** A sign-in in flight ("Waiting for passkey", "Opening GitHub"). */
  pending: SignInMethod | null;
  /** Desktop: the provider is open in the system browser. */
  inBrowser: SignInMethod | null;
  /** The button under a mouse pointer. */
  hovered: SignInMethod | null;
  /** The button holding keyboard (`:focus-visible`) focus. */
  focused: SignInMethod | null;
}

/** pending > inBrowser > hovered > focused > WANHEDA. */
export function resolveWord({ pending, inBrowser, hovered, focused }: WordInputs): AuthWord {
  return pending ?? inBrowser ?? hovered ?? focused ?? "wanheda";
}

/** Delay before the swarm takes `next`: only the way home waits. */
export function wordDelay(next: AuthWord): number {
  return next === "wanheda" ? WORD_GRACE_MS : 0;
}

/**
 * Hover and focus read back from the buttons themselves. Used after a
 * sign-in attempt fails: the buttons were disabled while it ran, and a
 * disabled button can miss its leave and blur events, so the stored state
 * may be stale.
 */
export function pickFromDom(
  buttons: Iterable<readonly [SignInMethod, { hover: boolean; focusVisible: boolean }]>,
): Pick<WordInputs, "hovered" | "focused"> {
  let hovered: SignInMethod | null = null;
  let focused: SignInMethod | null = null;
  for (const [method, state] of buttons) {
    if (state.hover) hovered = method;
    if (state.focusVisible) focused = method;
  }
  return { hovered, focused };
}
