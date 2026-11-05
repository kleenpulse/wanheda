import type { Notice } from "./notifications";

// Notices that arrive outside the shell load (a subscription save raising a
// reminder, V31) reach this tab's notification centre through one window
// event, so the money runtime needs no handle on the provider.

const EVENT = "wanheda:notices";

export function pushNotices(list: readonly Notice[]): void {
  if (typeof window === "undefined" || list.length === 0) return;
  window.dispatchEvent(new CustomEvent<readonly Notice[]>(EVENT, { detail: list }));
}

/** Listens for pushed notices. Returns the cleanup. */
export function onNotices(fn: (list: readonly Notice[]) => void): () => void {
  const listener = (e: Event) => {
    fn((e as CustomEvent<readonly Notice[]>).detail);
  };
  window.addEventListener(EVENT, listener);
  return () => {
    window.removeEventListener(EVENT, listener);
  };
}
