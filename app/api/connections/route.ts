import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/owner";
import { connectionsFor } from "@/lib/saas/server";

// Settings › Connections for TanStack Query. requireOwner() first (SPEC V7);
// the payload never holds a secret (V33).
export async function GET() {
  const owner = await requireOwner();
  const payload = await connectionsFor(owner);
  if (!payload) return NextResponse.json({ error: "load failed" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
