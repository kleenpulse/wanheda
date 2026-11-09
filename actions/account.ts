"use server";

import { isAPIError } from "better-auth/api";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { LAST_METHOD_COOKIE } from "@/lib/auth/last-method";
import { requireOwner } from "@/lib/auth/owner";
import { getAuth } from "@/lib/auth/server";

/**
 * `stale`: the session is over a day old; Better Auth wants a fresh sign-in first.
 * `mismatch`: the typed email is not the account's.
 */
export type DeleteAccountResult = { ok: true } | { ok: false; reason: "demo" | "invalid" | "mismatch" | "stale" | "failed" };

const schema = z.object({ confirm: z.string().max(320) }).strict();

const normal = (email: string) => email.trim().toLowerCase();

/**
 * Deletes the signed-in account and everything in it (V79). The user comes
 * from the session, never the client; the typed email only proves intent.
 * Better Auth deletes the user row (every table cascades from it), ends its
 * sessions and clears the cookie. The client then deletes the device stores.
 */
export async function deleteAccount(input: unknown): Promise<DeleteAccountResult> {
  const owner = await requireOwner();
  if (owner.kind === "demo") return { ok: false, reason: "demo" };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  if (!owner.user.email || normal(parsed.data.confirm) !== normal(owner.user.email)) return { ok: false, reason: "mismatch" };

  const auth = getAuth();
  if (!auth) return { ok: false, reason: "failed" };
  try {
    await auth.api.deleteUser({ headers: await headers(), body: {} });
    // Nobody comes back to this account, so /login shouldn't badge its method.
    (await cookies()).delete(LAST_METHOD_COOKIE);
    return { ok: true };
  } catch (error) {
    if (isAPIError(error) && error.body?.code === "SESSION_EXPIRED") return { ok: false, reason: "stale" };
    console.error("deleteAccount failed", error);
    return { ok: false, reason: "failed" };
  }
}
