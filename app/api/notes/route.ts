import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/owner";
import { notesFor } from "@/lib/notes/server";

// The notes list for TanStack Query's refetches. requireOwner() first (SPEC V7).
export async function GET() {
  const owner = await requireOwner();
  const payload = await notesFor(owner);
  return NextResponse.json(payload, {
    status: payload.source === "load-failed" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
