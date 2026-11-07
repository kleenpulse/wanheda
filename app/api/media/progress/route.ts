import { NextResponse, type NextRequest } from "next/server";
import { requireOwner } from "@/lib/auth/owner";
import { playbackWriteSchema, type PlaybackReply } from "@/lib/media/media";
import { savePlayback } from "@/lib/media/store";

// Where a video was left (SPEC V55). A route, not a server action, so a page
// that is closing can send its last position with sendBeacon (as text/plain).
// A cross-site sender is refused before anything else; requireOwner() first
// among the reads (V7); newer `at` wins in the store.

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_BODY = 1024;

function reply(body: PlaybackReply, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

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
  const parsed = playbackWriteSchema.safeParse(json);
  if (!parsed.success) return reply({ ok: false, reason: "invalid" }, 400);
  if (owner.kind === "demo") return reply({ ok: false, reason: "demo" });
  try {
    const r = await savePlayback(owner.user.id, parsed.data);
    if (!r) return reply({ ok: false, reason: "failed" }, 503);
    if (r.kind === "gone") return reply({ ok: false, reason: "gone" }, 404);
    return reply({ ok: true, kind: r.kind, progress: r.progress });
  } catch (error) {
    console.error("savePlayback failed", error);
    return reply({ ok: false, reason: "failed" }, 503);
  }
}
