import { NextResponse, type NextRequest } from "next/server";
import { requireOwner } from "@/lib/auth/owner";
import { daysBetween, isDay } from "@/lib/money/dates";
import { CUSTOM_MAX_DAYS } from "@/lib/money/periods";
import { moneyRangeFor } from "@/lib/money/server";

// Txns for a period older than the money window: `?from=YYYY-MM-DD&to=YYYY-MM-DD`.
// requireOwner() first (SPEC V7). The span covers a custom period and the one
// it is compared with, so at most two maximum custom lengths.
const MAX_SPAN_DAYS = CUSTOM_MAX_DAYS * 2;

export async function GET(request: NextRequest) {
  const owner = await requireOwner();
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  if (!isDay(from) || !isDay(to) || from > to || daysBetween(from, to) >= MAX_SPAN_DAYS) {
    return NextResponse.json({ error: "Bad range" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const payload = await moneyRangeFor(owner, from, to);
  if (!payload) return NextResponse.json({ error: "Load failed" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
