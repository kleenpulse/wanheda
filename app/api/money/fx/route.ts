import { NextResponse, type NextRequest } from "next/server";
import { requireOwner } from "@/lib/auth/owner";
import { addDays, daysBetween, isDay, todayIn } from "@/lib/money/dates";
import type { FxPayload } from "@/lib/money/fx";
import { ensureRates, readRates } from "@/lib/money/fx-store";
import { demoRates } from "@/lib/money/seed";

// Daily FX rates from `?from=YYYY-MM-DD` to today (FR-MONEY-14). requireOwner()
// first (SPEC V7). The owner's read fetches the days not stored yet, a few at
// a time; `incomplete` asks the client to come back for the rest. Demo gets a
// fixed table and never fetches.

/** About two years: the oldest custom period and the one before it. */
const MAX_SPAN_DAYS = 800;

export async function GET(request: NextRequest) {
  const owner = await requireOwner();
  // The day furthest ahead anywhere, so the owner's today is always inside.
  const today = todayIn("Pacific/Kiritimati");
  const asked = request.nextUrl.searchParams.get("from");
  if (!isDay(asked) || asked > today) return NextResponse.json({ error: "Bad day" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const from = daysBetween(asked, today) > MAX_SPAN_DAYS ? addDays(today, -MAX_SPAN_DAYS) : asked;

  if (owner.kind === "demo") {
    const payload: FxPayload = { from, rates: demoRates(todayIn("Africa/Lagos")), incomplete: false };
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  }
  let incomplete = false;
  try {
    incomplete = await ensureRates(from, today);
  } catch (error) {
    // Stored rates still serve; the next read tries again.
    console.error("fx: ensureRates failed", error);
  }
  const rates = await readRates(from, today);
  if (!rates) return NextResponse.json({ error: "Load failed" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const payload: FxPayload = { from, rates, incomplete };
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
