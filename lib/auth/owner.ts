import "server-only";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { after, connection } from "next/server";
import { cache } from "react";
import { recordActivity } from "@/lib/admin/activity";
import { adminEmails, gateMode } from "@/lib/capabilities";
import { decideOwner, type OwnerDecision, type SessionUser } from "./gate";
import { getAuth } from "./server";

// The real gate (SPEC V7). The proxy only looks for a cookie; this validates
// the session, re-reads the admin list on every call, and runs on every read
// and every server action. Server actions take the user from here, never from
// a client-sent id, and every store filters by that id, so one user never
// reaches another's rows (ADR-0015).

/** The full decision, deduped per request. Never redirects. */
export const getOwner = cache(async (): Promise<OwnerDecision> => {
  // Always decide at request time. Without this, Cache Components could
  // prerender the gate with build-time env and serve that page at runtime.
  await connection();

  const mode = gateMode();
  if (mode !== "gated") return decideOwner({ mode, user: null, admins: adminEmails() });

  const auth = getAuth();
  if (!auth) return { kind: "locked" };
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session ? { id: session.user.id, email: session.user.email, name: session.user.name } : null;
  const decision = decideOwner({ mode, user, admins: adminEmails() });
  // The admin page's active-user counts. After the reply, so it never slows a read.
  if (decision.kind === "owner") {
    const id = decision.user.id;
    after(() => recordActivity(id));
  }
  return decision;
});

export type Owner = { kind: "demo" } | { kind: "owner"; user: SessionUser; admin: boolean };

/** For pages, layouts and actions: returns the signed-in user (or demo), or redirects / throws. */
export async function requireOwner(): Promise<Owner> {
  const decision = await getOwner();
  switch (decision.kind) {
    case "demo":
    case "owner":
      return decision;
    case "anonymous":
      redirect("/login");
    case "locked":
      // The proxy answers 503 first; reaching this means it was bypassed.
      throw new Error("Wanheda is locked: a database is configured but auth is not.");
  }
}

/**
 * The admin page's gate. Anyone else, demo included, gets the not-found page
 * (the shell has usually streamed already, so the status may be 200): the page
 * does not admit it exists.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const owner = await requireOwner();
  if (owner.kind !== "owner" || !owner.admin) notFound();
  return owner.user;
}
