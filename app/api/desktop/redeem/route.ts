import { isAPIError } from "better-auth/api";
import type { NextRequest } from "next/server";
import { isHandoffValue, REDEEM_HEADER, single } from "@/lib/auth/desktop-link";
import { getAuth } from "@/lib/auth/server";

// The desktop app's window spends its sign-in token here (ADR-0016). Better
// Auth makes the app a session of its own and the response sets its cookie
// (nextCookies). Only the shell sends REDEEM_HEADER, and a link on another site
// can't add a header to a navigation: without it nothing is spent, so a
// stranger's token can't sign a browser into their account.

const HEADERS = { "cache-control": "no-store", "referrer-policy": "no-referrer" } as const;

function seeOther(location: string): Response {
  return new Response(null, { status: 303, headers: { ...HEADERS, location } });
}

const FAILED = "/login?error=desktop";

export async function GET(request: NextRequest): Promise<Response> {
  if (request.headers.get(REDEEM_HEADER) !== "1") return seeOther(FAILED);
  const token = single(request.nextUrl.searchParams, "token");
  if (!isHandoffValue(token)) return seeOther(FAILED);
  const auth = getAuth();
  if (!auth) return new Response("Sign-in is not configured.", { status: 503, headers: HEADERS });
  try {
    await auth.api.redeemDesktopToken({ body: { token }, headers: request.headers });
  } catch (err) {
    if (isAPIError(err)) return seeOther(FAILED);
    throw err;
  }
  return seeOther("/");
}
