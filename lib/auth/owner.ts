import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { gateMode, ownerEmails } from "@/lib/capabilities";
import { decideOwner, type OwnerDecision, type SessionUser } from "./gate";
import { getAuth } from "./server";

// The real gate (SPEC V7). The proxy only looks for a cookie; this validates
// the session, re-checks the allowlist on every call, and runs on every read
// and every server action. Server actions take the user from here, never from
// a client-sent id.

/** The full decision, deduped per request. Never redirects. */
export const getOwner = cache(async (): Promise<OwnerDecision> => {
  // Always decide at request time. Without this, Cache Components could
  // prerender the gate with build-time env and serve that page at runtime.
  await connection();

  const mode = gateMode();
  if (mode !== "gated") return decideOwner({ mode, user: null, owners: ownerEmails() });

  const auth = getAuth();
  if (!auth) return { kind: "locked" };
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session ? { id: session.user.id, email: session.user.email, name: session.user.name } : null;
  return decideOwner({ mode, user, owners: ownerEmails() });
});

export type Owner = { kind: "demo" } | { kind: "owner"; user: SessionUser };

/** For pages, layouts and actions: returns the owner, or redirects / throws. */
export async function requireOwner(): Promise<Owner> {
  const decision = await getOwner();
  switch (decision.kind) {
    case "demo":
    case "owner":
      return decision;
    case "anonymous":
      redirect("/login");
    case "not-owner":
      redirect("/login?error=not-owner");
    case "locked":
      // The proxy answers 503 first; reaching this means it was bypassed.
      throw new Error("Wanheda is locked: a database is configured but auth is not.");
  }
}
