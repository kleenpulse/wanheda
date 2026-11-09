import Dexie from "dexie";
import { ACCOUNT_STORES, deviceScope, scopedName, type AccountStore, type DeviceScope } from "./scope";

/**
 * Opens a device store under this account's name (lib/device/scope.ts).
 * Rejects outside the shell (no scope) or where IndexedDB is unavailable;
 * every caller already falls back to memory on a rejection.
 */
export async function openScopedDexie<D extends Dexie>(base: AccountStore, define: (db: D) => void): Promise<D> {
  const scope = deviceScope();
  if (!scope) throw new Error(`${base}: no account scope yet`);
  const db = new Dexie(scopedName(base, scope)) as D;
  define(db);
  await db.open();
  if (scope.adoptsLegacy) await adoptLegacy(base, db);
  return db;
}

/**
 * Deletes every device store of one account (V79), after its account is
 * deleted. Dexie closes its own connections when a delete asks, in any tab,
 * so nothing holds it up for long; the wait is bounded all the same, and a
 * delete still pending lands without this tab.
 */
export async function forgetAccountStores(scope: DeviceScope, waitMs = 2_000): Promise<void> {
  const deletes = Promise.allSettled(ACCOUNT_STORES.map((base) => Dexie.delete(scopedName(base, scope))));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, waitMs);
  });
  await Promise.race([deletes, timeout]);
  clearTimeout(timer);
}

const adoptedKey = (base: string) => `wanheda-adopted:${base}`;

function wasAdopted(base: string): boolean {
  try {
    return localStorage.getItem(adoptedKey(base)) === "1";
  } catch {
    return false;
  }
}

function markAdopted(base: string): void {
  try {
    localStorage.setItem(adoptedKey(base), "1");
  } catch {
    // Without storage the delete below is the only guard; bulkAdd still keeps newer rows.
  }
}

/**
 * Moves the rows of the store's old, unscoped database into `target`, once,
 * then deletes it. Rows already in `target` win (bulkAdd skips their keys).
 * A done-mark makes it one-shot even while the delete is held up by an old tab
 * that still has the database open; otherwise each open would copy again and
 * bring back outbox ops drained since. A Web Lock keeps two tabs from copying
 * at once.
 */
async function adoptLegacy(base: string, target: Dexie): Promise<void> {
  const run = async () => {
    if (!(await Dexie.exists(base))) return;
    if (wasAdopted(base)) {
      // Copied before; only the delete is still pending.
      void Dexie.delete(base).catch(() => undefined);
      return;
    }
    // No version: Dexie opens the existing schema as it is.
    const legacy = new Dexie(base);
    await legacy.open();
    try {
      for (const table of legacy.tables) {
        if (!target.tables.some((t) => t.name === table.name)) continue;
        const rows = await table.toArray();
        if (rows.length === 0) continue;
        await target
          .table(table.name)
          .bulkAdd(rows)
          .catch((error: unknown) => {
            if (!(error instanceof Dexie.BulkError)) throw error;
          });
      }
    } finally {
      legacy.close();
    }
    markAdopted(base);
    // Not awaited: an old tab holding the database open would block it until it closes.
    void Dexie.delete(base).catch(() => undefined);
  };
  try {
    if (typeof navigator !== "undefined" && "locks" in navigator) await navigator.locks.request(`wanheda-legacy:${base}`, run);
    else await run();
  } catch (error) {
    // The new store works without the old rows; try again next open.
    console.error(`${base}: could not adopt the old device store`, error);
  }
}
