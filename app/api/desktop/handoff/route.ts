import { isAPIError } from "better-auth/api";
import type { NextRequest } from "next/server";
import { appLink, isHandoffValue, SIGN_IN_PAGE, signInPagePath, single } from "@/lib/auth/desktop-link";
import { getAuth } from "@/lib/auth/server";

// The desktop sign-in page's "Open Wanheda" link (ADR-0016). In the system
// browser, signed in: mints a single-use token for this user and hands it to
// the desktop app through `wanheda://auth`, with the app's nonce. A GET from a
// link, not a form, because the CSP's form-action keeps form posts on this site.
// The token only ever goes to this device's app, which drops it unless the
// nonce is one it made itself.

const HEADERS = { "cache-control": "no-store", "referrer-policy": "no-referrer" } as const;

function seeOther(location: string): Response {
  return new Response(null, { status: 303, headers: { ...HEADERS, location } });
}

export async function GET(request: NextRequest): Promise<Response> {
  const nonce = single(request.nextUrl.searchParams, "nonce");
  // The page says what went wrong.
  if (!isHandoffValue(nonce)) return seeOther(SIGN_IN_PAGE);
  const auth = getAuth();
  if (!auth) return new Response("Sign-in is not configured.", { status: 503, headers: HEADERS });
  try {
    const { token } = await auth.api.mintDesktopToken({ headers: request.headers });
    return seeOther(appLink(token, nonce));
  } catch (err) {
    // No valid session: sign in first, then come back to the page.
    if (isAPIError(err)) return seeOther(`/login?next=${encodeURIComponent(signInPagePath(nonce))}`);
    throw err;
  }
}
