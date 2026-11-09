// Whose data this tab's device stores hold (ADR-0015). Anyone can sign up, so
// two people may share one browser: every IndexedDB store that keeps user data
// (caches, outboxes, the music index, PDF passwords) is named per account, so
// one user never sees, or replays, another's local data. Pure and import-free;
// the shell's AccountProvider sets the scope before any store opens.

export interface DeviceScope {
  /** `u.<user id>` for a signed-in user, `demo` for demo mode. */
  id: string;
  /** The signed-in user's id, or null in demo. Replayed writes send it so the server can refuse another account's queue (V78). */
  userId: string | null;
  /**
   * Adopts the stores from before per-user names (2026-11-09). Only the old
   * allowlisted owner could have written them, and that owner is the admin.
   */
  adoptsLegacy: boolean;
}

export function scopeFor(account: { kind: "owner" | "demo"; id: string | null; admin: boolean }): DeviceScope {
  if (account.kind === "owner" && account.id) return { id: `u.${account.id}`, userId: account.id, adoptsLegacy: account.admin };
  return { id: "demo", userId: null, adoptsLegacy: false };
}

/** `wanheda-notes` → `wanheda-notes@u.123`. */
export function scopedName(base: string, scope: DeviceScope): string {
  return `${base}@${scope.id}`;
}

let current: DeviceScope | null = null;

/** Called by the shell's AccountProvider, during render, so it lands before any child effect opens a store. */
export function setDeviceScope(scope: DeviceScope | null): void {
  current = scope;
}

/** The account a replayed write belongs to, for the action's `asUser` check; undefined in demo or outside the shell. */
export function queueOwner(): string | undefined {
  return current?.userId ?? undefined;
}

/** The scope stores open under, or null outside the shell: callers then keep data in memory only. */
export function deviceScope(): DeviceScope | null {
  return current;
}
