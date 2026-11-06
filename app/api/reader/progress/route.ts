import { NextResponse, type NextRequest } from "next/server";
import { requireOwner } from "@/lib/auth/owner";
import { progressWriteSchema, type ProgressReply } from "@/lib/reader/reader";
import { saveProgress } from "@/lib/reader/store";

// Reading progress writes (SPEC V41). A route, not a server action, so a page
// that is closing can send its last position with sendBeacon. The beacon goes
// as text/plain (a JSON body would be refused by some browsers), so the body
// is parsed here, and a cross-site sender is refused before anything else.
// requireOwner() first among the reads (V7); newer `at` wins in the store.

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_BODY = 4096;

function reply(body: ProgressReply, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/** Same-origin only: the beacon carries the session cookie, so a cross-site page must not be able to send one. */
function crossSite(request: NextRequest): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return true;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== (request.headers.get("x-forwarded-host") ?? request.headers.get("host"));
  } catch {
    return true;
  }
}

export async function POST(request: NextRequest) {
  if (crossSite(request)) return reply({ ok: false, reason: "invalid" }, 403);
  // Refused unread when the sender declares too much; checked again after reading (a chunked body has no length).
  if (Number(request.headers.get("content-length") ?? "0") > MAX_BODY) return reply({ ok: false, reason: "invalid" }, 413);
  const owner = await requireOwner();
  const text = await request.text().catch(() => "");
  if (text.length > MAX_BODY) return reply({ ok: false, reason: "invalid" }, 413);
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Falls through to the schema, which refuses null.
  }
  const parsed = progressWriteSchema.safeParse(json);
  if (!parsed.success) return reply({ ok: false, reason: "invalid" }, 400);
  if (owner.kind === "demo") return reply({ ok: false, reason: "demo" });
  try {
    const r = await saveProgress(owner.user.id, parsed.data);
    if (!r) return reply({ ok: false, reason: "failed" }, 503);
    if (r.kind === "gone") return reply({ ok: false, reason: "gone" }, 404);
    return reply({ ok: true, kind: r.kind, progress: r.progress });
  } catch (error) {
    console.error("saveProgress failed", error);
    return reply({ ok: false, reason: "failed" }, 503);
  }
}
