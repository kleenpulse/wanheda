import type { GateMode } from "@/lib/capabilities";
import { isListed } from "./allowlist";

// The access decisions, with no IO, so every branch is unit-tested. proxy.ts
// and owner.ts gather the inputs and act on the result.

/** Reachable without a session in gated mode (FRD D3). */
const PUBLIC_PREFIXES = ["/login", "/api/auth", "/api/webhooks"] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * A post-login destination from `?next=`. Only same-origin paths survive:
 * anything absolute, protocol-relative (`//host`), backslashed, or pointing
 * back at /login becomes "/".
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  try {
    const url = new URL(raw, "http://wanheda.invalid");
    if (url.origin !== "http://wanheda.invalid" || isLoginPath(url.pathname)) return "/";
    // Check the output too: dot-segments can rebuild "//" after normalising
    // ("/.//evil.example.com" → "//evil.example.com", a protocol-relative URL).
    const out = `${url.pathname}${url.search}${url.hash}`;
    if (out.startsWith("//") || out.includes("\\")) return "/";
    return out;
  } catch {
    return "/";
  }
}

function isLoginPath(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/login/");
}

export type ProxyDecision =
  | { kind: "pass" }
  | { kind: "unavailable" }
  | { kind: "redirect"; location: string };

/**
 * The proxy is UX, not the gate (SPEC V7): it checks only that a session
 * cookie exists. `requireOwner()` validates the session on the server.
 */
export function decideProxy(input: {
  mode: GateMode;
  pathname: string;
  search: string;
  hasSessionCookie: boolean;
}): ProxyDecision {
  switch (input.mode) {
    case "demo":
      return { kind: "pass" };
    case "locked":
      return { kind: "unavailable" };
    case "gated": {
      if (isPublicPath(input.pathname) || input.hasSessionCookie) return { kind: "pass" };
      const next = safeNextPath(`${input.pathname}${input.search}`);
      return {
        kind: "redirect",
        location: next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`,
      };
    }
  }
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

/**
 * Who is asking. "owner" is any signed-in user: each one owns their own data
 * (ADR-0015). `admin` is re-read from ADMIN_EMAILS on every call, so taking an
 * email off the list removes the admin page at once.
 */
export type OwnerDecision =
  | { kind: "demo" }
  | { kind: "owner"; user: SessionUser; admin: boolean }
  | { kind: "anonymous" }
  | { kind: "locked" };

export function decideOwner(input: {
  mode: GateMode;
  user: SessionUser | null;
  admins: ReadonlySet<string>;
}): OwnerDecision {
  if (input.mode === "demo") return { kind: "demo" };
  if (input.mode === "locked") return { kind: "locked" };
  if (!input.user) return { kind: "anonymous" };
  return { kind: "owner", user: input.user, admin: isListed(input.user.email, input.admins) };
}
