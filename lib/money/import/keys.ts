import type { StatementRow } from "./mapping";

// Import dedupe keys (SPEC V12, V32). Pure and async (Web Crypto works in the
// worker, the browser and Node alike).

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** sha256(account id ‖ file bytes): the same file into the same account twice imports nothing (V32). */
export async function fileKey(accountId: string, bytes: Uint8Array): Promise<string> {
  const id = new TextEncoder().encode(`${accountId}\u0000`);
  const all = new Uint8Array(id.length + bytes.length);
  all.set(id);
  all.set(bytes, id.length);
  return sha256Hex(all);
}

/** Lower case, one space: "POS  PURCHASE" and "pos purchase" are the same payee. */
export function normalisePayee(payee: string): string {
  return payee.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * One key per row, stored as `txn.external_id` (V12). The bank's own id wins
 * when the file has one. Otherwise a hash of day, amount and payee, plus the
 * running balance when the statement has one (it tells two identical rows
 * apart, and it is the same in a later statement that overlaps), else plus
 * how many times that day, amount and payee came before it in this file.
 * So 2 identical rows import as 2, and a re-download imports 0.
 */
export async function rowKeys(rows: readonly StatementRow[]): Promise<string[]> {
  // A transfer, its fee and its VAT often share one session id: a reference
  // that repeats in the file is not unique, so those rows add the hash too.
  const refCount = new Map<string, number>();
  for (const r of rows) if (r.reference !== null) refCount.set(r.reference, (refCount.get(r.reference) ?? 0) + 1);
  const seen = new Map<string, number>();
  const keys = await Promise.all(
    rows.map(async (r) => {
      // Hashed with the day: always 68 characters however long the reference, and a
      // short reference a bank reuses (cheque numbers) doesn't match last month's row.
      if (r.reference !== null && refCount.get(r.reference) === 1) return `ref:${await sha256Hex(`${r.postedOn}|${r.reference}`)}`;
      const tuple = `${r.reference ?? ""}|${r.postedOn}|${String(r.amountMinor)}|${normalisePayee(r.payee)}`;
      let tail: string;
      if (r.balanceMinor !== null) tail = `bal:${String(r.balanceMinor)}`;
      else {
        const n = seen.get(tuple) ?? 0;
        seen.set(tuple, n + 1);
        tail = `n:${String(n)}`;
      }
      return `h:${await sha256Hex(`${tuple}|${tail}`)}`;
    }),
  );
  // A balance column that never moves (some exports print the available
  // balance on every line) can give two rows one key. The second would be
  // dropped by the DB as "already present", so it gets its place in the file.
  const used = new Map<string, number>();
  return keys.map((k) => {
    const n = used.get(k) ?? 0;
    used.set(k, n + 1);
    return n === 0 ? k : `${k}#${String(n)}`;
  });
}
