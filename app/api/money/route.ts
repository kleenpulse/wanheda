import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/owner";
import { moneyFor } from "@/lib/money/server";

// The money window for TanStack Query's refetches. requireOwner() first (SPEC V7).
export async function GET() {
  const owner = await requireOwner();
  const payload = await moneyFor(owner);
  return NextResponse.json(payload, {
    status: payload.source === "load-failed" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
