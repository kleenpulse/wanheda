import { after, NextResponse } from "next/server";
import { z } from "zod";
import { connectorSealKey, has } from "@/lib/capabilities";
import { fromWebhook } from "@/lib/saas/polar/events";
import { verifyPolarWebhook } from "@/lib/saas/polar/webhook";
import { reconcile } from "@/lib/saas/reconcile";
import { markConnector, openConnector, recordDelivery } from "@/lib/saas/store";

// Polar webhooks for one connector (SPEC V34). No session: the path is public
// (`/api/webhooks`), so nothing is read or written until the signature over
// the raw body checks out with this connector's own secret. Then the delivery
// is stored once, 200 goes back, and reconcile() runs after the response.

/** Polar's payloads are a few KB; anything this big is not one of them. */
const MAX_BODY_BYTES = 1_000_000;

const json = (status: number, body: Record<string, unknown>) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request, { params }: { params: Promise<{ connectorId: string }> }) {
  const id = z.uuid().safeParse((await params).connectorId);
  if (!id.success) return json(404, { error: "unknown connector" });

  const key = connectorSealKey();
  if (!has("connectors") || !key) return json(503, { error: "connectors are off" });

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return json(413, { error: "too large" });
  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) return json(413, { error: "too large" });

  const c = await openConnector(id.data, key);
  if (c === null) return json(404, { error: "unknown connector" });
  // 503, not 4xx: Polar retries, and the owner fixes the secret meanwhile.
  if (c === "broken" || !c.secret.webhookSecret) return json(503, { error: "webhook secret not set" });

  const verified = verifyPolarWebhook({ body, headers: request.headers, secret: c.secret.webhookSecret });
  if (!verified.ok) return json(verified.reason === "json" ? 400 : 401, { error: verified.reason });

  const event = fromWebhook(verified.event, verified.id);
  const stored = await recordDelivery(c, verified.id, event === "ignored" || event === null ? null : event);
  if (event === null && stored === "new") {
    // Signed but not a shape we read: retrying won't change it, so it's marked
    // processed. Say so on the connector, or a Polar payload change would drop
    // every webhook quietly until the next pull.
    console.warn("polar webhook: unreadable event", verified.id);
    await markConnector(c.id, { ok: false, error: "Polar sent an event Wanheda can't read yet. Sync now to pull it another way." });
  }
  if (stored === null) return json(503, { error: "database unavailable" });

  if (stored === "new" && event !== "ignored" && event !== null) {
    after(async () => {
      try {
        await reconcile(c.id);
      } catch (error) {
        console.error("polar webhook: reconcile failed", error);
      }
    });
  }
  return json(200, { ok: true, duplicate: stored === "duplicate" });
}
