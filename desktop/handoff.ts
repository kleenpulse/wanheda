import { randomBytes, timingSafeEqual } from "node:crypto";
import { MAX_LINK } from "./links";

/*
 * Sign-in through the system browser (ADR-0016, SPEC V68). The login page asks
 * main to start one: main makes a nonce and opens the hosted app's
 * /desktop/sign-in?nonce=… in the default browser. Signed in there, the page
 * hands a single-use token back through `wanheda://auth?token=…&nonce=…`.
 * Main takes it only if the nonce is the one it made (and hasn't used), so a
 * link from anyone else can't sign the app into their account (login CSRF),
 * then loads the redeem URL in the app's window, which gets the session cookie.
 *
 * The shapes and paths mirror lib/auth/desktop-link.ts (handoff.test.ts checks them).
 */

/** How long main waits for the browser: time to sign in there, with any method. */
export const HANDOFF_TTL_MS = 10 * 60_000;

export const SIGN_IN_PAGE = "/desktop/sign-in";
export const REDEEM_PATH = "/api/desktop/redeem";
/** Only main sends it, on the redeem load: the server refuses the token without it. */
export const REDEEM_HEADER = "x-wanheda-redeem";

/** 32 random bytes as base64url: the nonce main makes, and the token the server makes. */
const VALUE = /^[A-Za-z0-9_-]{43}$/;

export type PendingHandoff = { nonce: string; expiresAt: number };
export type AuthLink = { token: string; nonce: string };

/** A new sign-in to wait for. Starting another replaces it: the newest wins. */
export function newHandoff(now: number, random: Buffer = randomBytes(32)): PendingHandoff {
  return { nonce: random.toString("base64url"), expiresAt: now + HANDOFF_TTL_MS };
}

export function signInPageUrl(appOrigin: string, nonce: string): string {
  return `${appOrigin}${SIGN_IN_PAGE}?nonce=${nonce}`;
}

export function redeemUrl(appOrigin: string, token: string): string {
  return `${appOrigin}${REDEEM_PATH}?token=${token}`;
}

/**
 * The token and nonce of a `wanheda://auth` link, or null for anything else:
 * another kind of link, a missing, repeated or unknown key, a value of the
 * wrong shape, a fragment, or a link over MAX_LINK.
 */
export function authLink(link: string): AuthLink | null {
  if (link.length > MAX_LINK) return null;
  // Windows can add a slash before the query when it passes a link on.
  const match = /^wanheda:\/\/auth\/?\?([^#]*)$/i.exec(link);
  if (!match) return null;
  const params = new URLSearchParams(match[1]);
  const keys = [...params.keys()];
  if (keys.length !== 2) return null;
  const token = params.getAll("token");
  const nonce = params.getAll("nonce");
  if (token.length !== 1 || nonce.length !== 1) return null;
  const [t, n] = [token[0] ?? "", nonce[0] ?? ""];
  return VALUE.test(t) && VALUE.test(n) ? { token: t, nonce: n } : null;
}

/** Whether a link answers the sign-in main is waiting for: same nonce, in time. */
export function acceptHandoff(link: AuthLink, pending: PendingHandoff | null, now: number): boolean {
  if (!pending || now > pending.expiresAt) return false;
  const got = Buffer.from(link.nonce);
  const want = Buffer.from(pending.nonce);
  return got.length === want.length && timingSafeEqual(got, want);
}
