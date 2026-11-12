// The desktop sign-in handoff (ADR-0016, SPEC V68): the shapes the browser
// page, the two route handlers and the desktop shell agree on. No IO here, so
// the web side and the tests share it; desktop/handoff.ts mirrors the shapes.

/**
 * A nonce (made by the shell) or a token (made by the server): 32 random bytes
 * as base64url, so exactly 43 characters from a URL-safe alphabet.
 */
const RANDOM_43 = /^[A-Za-z0-9_-]{43}$/;

export function isHandoffValue(value: unknown): value is string {
  return typeof value === "string" && RANDOM_43.test(value);
}

/** The value of a query key given exactly once, or null (missing, repeated). */
export function single(params: URLSearchParams, key: string): string | null {
  const values = params.getAll(key);
  return values.length === 1 ? (values[0] ?? null) : null;
}

/** The page the shell opens in the system browser. */
export const SIGN_IN_PAGE = "/desktop/sign-in";
/** Mints the token and hands it to the app: the page's "Open Wanheda" link. */
export const HANDOFF_PATH = "/api/desktop/handoff";
/** Where the app's window spends the token. */
export const REDEEM_PATH = "/api/desktop/redeem";

/**
 * Sent only by the shell when it loads the redeem URL. A link or a form on
 * another site can't add a header to a navigation, so a stranger's token can't
 * sign a browser into their account (login CSRF).
 */
export const REDEEM_HEADER = "x-wanheda-redeem";

/** How long a minted token lives: enough to answer the browser's "Open Wanheda?" prompt. */
export const HANDOFF_TTL_SECONDS = 120;

export function signInPagePath(nonce: string): string {
  return `${SIGN_IN_PAGE}?nonce=${nonce}`;
}

export function handoffPath(nonce: string): string {
  return `${HANDOFF_PATH}?nonce=${nonce}`;
}

/** The link that hands the token to the desktop app. Both values are URL-safe already. */
export function appLink(token: string, nonce: string): string {
  return `wanheda://auth?token=${token}&nonce=${nonce}`;
}
