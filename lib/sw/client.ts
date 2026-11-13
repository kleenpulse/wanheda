import type { WorkerMessage } from "./policy";

// The page's side of the service worker (lib/sw/worker.ts, T91).

/**
 * Registers /sw.js in a production build. In `next dev` it removes any worker
 * a production run on the same origin left behind, which would otherwise serve
 * stale build files from its cache.
 */
export async function syncServiceWorker(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    if (process.env.NODE_ENV !== "production") {
      for (const registration of await navigator.serviceWorker.getRegistrations()) await registration.unregister();
      return;
    }
    await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  } catch {
    // No worker (private mode, blocked storage): the app works as before, just not offline from cold.
  }
}

/**
 * Tells the worker whose pages this tab shows (a `lib/device/scope.ts` id, or
 * null when signed out); it deletes saved pages that belong to anyone else.
 * Posted to the controlling worker synchronously when there is one, so it
 * still lands when the page is about to navigate away (sign-out).
 */
export function tellWorkerAccount(scope: string | null): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const message: WorkerMessage = { type: "account", scope };
  const controller = navigator.serviceWorker.controller;
  if (controller) {
    controller.postMessage(message);
    return;
  }
  void navigator.serviceWorker.ready.then((registration) => registration.active?.postMessage(message)).catch(() => undefined);
}
