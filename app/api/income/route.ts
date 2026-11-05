import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/owner";
import { incomeFor } from "@/lib/saas/income-server";

// The income read for TanStack Query's refetches. requireOwner() first (SPEC V7).
export async function GET() {
  const owner = await requireOwner();
  const payload = await incomeFor(owner);
  return NextResponse.json(payload, {
    status: payload.source === "load-failed" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
