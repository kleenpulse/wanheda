import { NextResponse, type NextRequest } from "next/server";
import { requireOwner } from "@/lib/auth/owner";
import { hitOf } from "@/lib/notes/notes";
import { searchFor } from "@/lib/notes/server";

// Full-text note search for the palette (FR-NOTES-7). requireOwner() first (SPEC V7).
export async function GET(request: NextRequest) {
  const owner = await requireOwner();
  const query = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 200);
  const found = await searchFor(owner, query);
  if (found === null) {
    return NextResponse.json({ error: "search-failed" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ hits: found.map(hitOf) }, { headers: { "Cache-Control": "no-store" } });
}
