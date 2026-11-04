import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { decideProxy } from "@/lib/auth/gate";
import { gateMode } from "@/lib/capabilities";

// UX only (SPEC V7): locked mode answers 503 everywhere, gated mode sends
// cookieless requests to /login. Whether the cookie holds a valid owner
// session is decided by requireOwner() on the server.
export function proxy(request: NextRequest) {
  const decision = decideProxy({
    mode: gateMode(),
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    hasSessionCookie: getSessionCookie(request) !== null,
  });

  switch (decision.kind) {
    case "pass":
      return NextResponse.next();
    case "unavailable":
      return new NextResponse("Wanheda is locked until sign-in is configured.", {
        status: 503,
        headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
      });
    case "redirect":
      return NextResponse.redirect(new URL(decision.location, request.url));
  }
}

export const config = {
  // Everything except build assets and static files, which hold no data. A
  // route must never end in one of these extensions, or it skips the proxy
  // (requireOwner still fails closed there). SPEC V6.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|woff2?)$).*)"],
};
