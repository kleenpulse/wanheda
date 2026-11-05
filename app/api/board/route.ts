import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/owner";
import { boardFor } from "@/lib/board/server";

// The home board for TanStack Query's fetches. requireOwner() first (SPEC V7).
// A failed read answers 503, so the client keeps the board it already has.
export async function GET() {
  const owner = await requireOwner();
  const payload = await boardFor(owner);
  return NextResponse.json(payload, {
    status: payload.source === "load-failed" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
