// Keeps every tab of this browser on one account (ADR-0015). The session
// cookie is shared by all tabs, so a tab still showing user A after B signs in
// would send A's queued writes with B's session. Each shell tab announces its
// account; a tab that hears a different one (or a sign-out) reloads, which
// either opens B's stores or lands on /login.

const CHANNEL = "wanheda-account";

type Message = { scope: string | null };

function channel(): BroadcastChannel | null {
  return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL);
}

/** Tells the other tabs which account this one is (null: signed out). */
export function announceAccount(scope: string | null): void {
  const ch = channel();
  if (!ch) return;
  ch.postMessage({ scope } satisfies Message);
  ch.close();
}

/** Announces `scope`, then calls `onOther` when another tab speaks for a different account. Returns the stop function. */
export function watchAccount(scope: string, onOther: () => void): () => void {
  const ch = channel();
  if (!ch) return () => undefined;
  ch.onmessage = (event: MessageEvent<Message>) => {
    if (event.data.scope !== scope) onOther();
  };
  ch.postMessage({ scope } satisfies Message);
  return () => {
    ch.close();
  };
}
