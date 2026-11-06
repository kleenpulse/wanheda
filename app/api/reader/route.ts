import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/owner";
import { readerFor } from "@/lib/reader/server";

// The library for TanStack Query's refetches. requireOwner() first (SPEC V7).
export async function GET() {
  const owner = await requireOwner();
  const payload = await readerFor(owner);
  return NextResponse.json(payload, {
    status: payload.source === "load-failed" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
