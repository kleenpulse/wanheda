import { getAuth } from "@/lib/auth/server";

// Better Auth's handler. Without auth configured it answers 503, never a
// half-working sign-in.
async function handle(request: Request): Promise<Response> {
  const auth = getAuth();
  if (!auth) {
    return new Response("Sign-in is not configured.", {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }
  return auth.handler(request);
}

export { handle as GET, handle as POST };
