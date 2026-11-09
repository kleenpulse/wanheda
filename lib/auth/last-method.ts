// The "Last used" badge on /login (V81). Better Auth's lastLoginMethod plugin
// writes this cookie after a sign-in succeeds; the login page reads it on the
// server, so the badge is there on first paint. It holds a method name only.

export const LAST_METHOD_COOKIE = "wanheda.last_sign_in";

export const SIGN_IN_METHODS = ["passkey", "github", "google"] as const;
export type SignInMethod = (typeof SIGN_IN_METHODS)[number];

/** The cookie's value as a known method, or null for anything else (absent, tampered, a method Wanheda doesn't offer). */
export function parseLastMethod(raw: string | undefined): SignInMethod | null {
  return SIGN_IN_METHODS.find((method) => method === raw) ?? null;
}
