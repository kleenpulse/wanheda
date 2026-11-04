// The nav rail's saved state (FR-SHELL-1). A plain module, not a "use client"
// one: the shell layout (server) reads the cookie and the rail (client) writes
// it, and a constant exported from a client module reaches the server only as
// a reference. Ported from admin_shadow-garden lib/shell/rail.ts.

export const RAIL_COOKIE = "wanheda-rail";

/** Raven's rail is 84px; expanded it makes room for labels. */
export const RAIL_WIDTH = { collapsed: 84, expanded: 232 } as const;

/** Anything but an explicit "open" is collapsed, the Raven default. */
export function parseRail(value: string | undefined | null): boolean {
  return value === "open";
}

/** The cookie string the rail writes on toggle: a year, whole site, never sent cross-site. */
export function railCookie(expanded: boolean): string {
  return `${RAIL_COOKIE}=${expanded ? "open" : "closed"}; path=/; max-age=31536000; samesite=lax`;
}

/** Set on <html> before first paint when the rail is open; the shell fallback reads it. */
export const RAIL_ATTR = "data-rail";

/**
 * An inline script for <head> (the next-themes pattern). The shell's Suspense
 * fallback is static and cannot see the cookie, so without this the first
 * paint of a hard load has a rail-less page that jumps when the real shell
 * streams in (FR-SHELL-1). It reads the same cookie as the server, so the two
 * always agree. If a CSP arrives, this needs a nonce or a hash.
 */
export function railBootScript(): string {
  return `try{if(/(?:^|;\\s*)${RAIL_COOKIE}=open(?:;|$)/.test(document.cookie))document.documentElement.setAttribute("${RAIL_ATTR}","open")}catch(e){}`;
}
