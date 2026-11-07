// Chrome freezes a scroll-driven animation when its scroller stops
// overflowing: the scroll timeline goes inactive and the shadcn `scroll-fade`
// keeps its last "scrolled" mask, so the first row stays faded at the top
// (§B, V63). Restarting the animation lets it settle on the at-rest values.

type Scroller = {
  readonly scrollHeight: number;
  readonly clientHeight: number;
  getBoundingClientRect: () => unknown;
  style: { animation: string };
};

/** Resets a stuck scroll-fade once the scroller no longer overflows. True if it did. */
export function settleScrollFade(el: Scroller): boolean {
  if (el.scrollHeight > el.clientHeight) return false;
  const inline = el.style.animation;
  el.style.animation = "none";
  void el.getBoundingClientRect(); // flush style so the restart takes
  el.style.animation = inline;
  return true;
}
